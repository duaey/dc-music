const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const play = require('play-dl');
const express = require('express');

// Express server for health checks
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Discord Müzik Botu çalışıyor! 🎵');
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'online',
        bot: client.user ? client.user.tag : 'Bağlanıyor...',
        uptime: process.uptime()
    });
});

app.listen(PORT, () => {
    console.log(`✅ Web sunucusu ${PORT} portunda çalışıyor`);
});

// Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// Queue sistemi
const queues = new Map();

function getQueue(guildId) {
    if (!queues.has(guildId)) {
        queues.set(guildId, {
            songs: [],
            player: null,
            connection: null,
            textChannel: null,
            playing: false
        });
    }
    return queues.get(guildId);
}

async function playSong(guildId) {
    const queue = getQueue(guildId);
    
    if (queue.songs.length === 0) {
        if (queue.connection) {
            queue.connection.destroy();
        }
        queues.delete(guildId);
        return;
    }

    const song = queue.songs[0];
    
    try {
        const stream = await play.stream(song.url);
        const resource = createAudioResource(stream.stream, {
            inputType: stream.type
        });

        queue.player.play(resource);
        queue.playing = true;

        if (queue.textChannel) {
            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('🎵 Şimdi Çalıyor')
                .setDescription(`**${song.title}**`)
                .addFields(
                    { name: 'Süre', value: song.duration, inline: true },
                    { name: 'İsteyen', value: song.requestedBy, inline: true }
                )
                .setThumbnail(song.thumbnail);
            
            queue.textChannel.send({ embeds: [embed] });
        }
    } catch (error) {
        console.error('Şarkı çalma hatası:', error);
        if (queue.textChannel) {
            queue.textChannel.send(`❌ Şarkı çalınamadı: ${error.message}`);
        }
        queue.songs.shift();
        playSong(guildId);
    }
}

client.once('ready', () => {
    console.log(`✅ Bot hazır! ${client.user.tag} olarak giriş yapıldı`);
    console.log(`📊 ${client.guilds.cache.size} sunucuda aktif`);
});

client.on('messageCreate', async message => {
    if (message.author.bot || !message.content.startsWith('!')) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // PLAY komutu
    if (command === 'play' || command === 'p') {
        if (!message.member.voice.channel) {
            return message.reply('❌ Önce bir ses kanalına katılmalısın!');
        }

        if (!args.length) {
            return message.reply('❌ Lütfen bir YouTube linki veya şarkı adı gir!');
        }

        const query = args.join(' ');
        const queue = getQueue(message.guild.id);
        queue.textChannel = message.channel;

        try {
            // Arama yap
            let songInfo;
            
            if (play.yt_validate(query) === 'video') {
                // Direkt YouTube linki
                const info = await play.video_info(query);
                songInfo = {
                    url: info.video_details.url,
                    title: info.video_details.title,
                    duration: info.video_details.durationRaw,
                    thumbnail: info.video_details.thumbnails[0]?.url || '',
                    requestedBy: message.author.tag
                };
            } else if (play.yt_validate(query) === 'playlist') {
                // Playlist
                const playlist = await play.playlist_info(query, { incomplete: true });
                const videos = await playlist.all_videos();
                
                for (const video of videos) {
                    queue.songs.push({
                        url: video.url,
                        title: video.title,
                        duration: video.durationRaw,
                        thumbnail: video.thumbnails[0]?.url || '',
                        requestedBy: message.author.tag
                    });
                }
                
                message.reply(`✅ **${playlist.title}** playlist'i eklendi! (${videos.length} şarkı)`);
                
                if (!queue.playing) {
                    // Bağlantı kur
                    if (!queue.connection) {
                        queue.connection = joinVoiceChannel({
                            channelId: message.member.voice.channel.id,
                            guildId: message.guild.id,
                            adapterCreator: message.guild.voiceAdapterCreator
                        });

                        queue.player = createAudioPlayer();
                        queue.connection.subscribe(queue.player);

                        queue.player.on(AudioPlayerStatus.Idle, () => {
                            queue.songs.shift();
                            playSong(message.guild.id);
                        });

                        queue.player.on('error', error => {
                            console.error('Player hatası:', error);
                            queue.songs.shift();
                            playSong(message.guild.id);
                        });
                    }
                    
                    playSong(message.guild.id);
                }
                return;
            } else {
                // Arama yap
                const searched = await play.search(query, { limit: 1 });
                if (searched.length === 0) {
                    return message.reply('❌ Hiçbir sonuç bulunamadı!');
                }
                songInfo = {
                    url: searched[0].url,
                    title: searched[0].title,
                    duration: searched[0].durationRaw,
                    thumbnail: searched[0].thumbnails[0]?.url || '',
                    requestedBy: message.author.tag
                };
            }

            queue.songs.push(songInfo);
            
            if (!queue.playing) {
                // Ses kanalına bağlan
                queue.connection = joinVoiceChannel({
                    channelId: message.member.voice.channel.id,
                    guildId: message.guild.id,
                    adapterCreator: message.guild.voiceAdapterCreator
                });

                queue.player = createAudioPlayer();
                queue.connection.subscribe(queue.player);

                queue.player.on(AudioPlayerStatus.Idle, () => {
                    queue.songs.shift();
                    playSong(message.guild.id);
                });

                queue.player.on('error', error => {
                    console.error('Player hatası:', error);
                    queue.songs.shift();
                    playSong(message.guild.id);
                });

                queue.connection.on(VoiceConnectionStatus.Disconnected, async () => {
                    try {
                        await Promise.race([
                            entersState(queue.connection, VoiceConnectionStatus.Signalling, 5000),
                            entersState(queue.connection, VoiceConnectionStatus.Connecting, 5000),
                        ]);
                    } catch (error) {
                        queue.connection.destroy();
                        queues.delete(message.guild.id);
                    }
                });

                playSong(message.guild.id);
                message.reply(`✅ **${songInfo.title}** çalınıyor!`);
            } else {
                message.reply(`✅ **${songInfo.title}** sıraya eklendi! (Sıra: ${queue.songs.length})`);
            }

        } catch (error) {
            console.error('Play hatası:', error);
            message.reply(`❌ Hata: ${error.message}`);
        }
    }

    // SKIP komutu
    if (command === 'skip' || command === 's') {
        const queue = getQueue(message.guild.id);
        if (!queue.playing || queue.songs.length === 0) {
            return message.reply('❌ Çalan bir şarkı yok!');
        }
        
        queue.player.stop();
        message.reply('⏭️ Şarkı atlandı!');
    }

    // STOP komutu
    if (command === 'stop') {
        const queue = getQueue(message.guild.id);
        if (!queue.connection) {
            return message.reply('❌ Bot ses kanalında değil!');
        }
        
        queue.songs = [];
        queue.playing = false;
        if (queue.player) queue.player.stop();
        if (queue.connection) queue.connection.destroy();
        queues.delete(message.guild.id);
        
        message.reply('⏹️ Müzik durduruldu ve kuyruk temizlendi!');
    }

    // QUEUE komutu
    if (command === 'queue' || command === 'q') {
        const queue = getQueue(message.guild.id);
        if (queue.songs.length === 0) {
            return message.reply('❌ Kuyruk boş!');
        }

        const current = queue.songs[0];
        const upcoming = queue.songs.slice(1, 11);

        let description = `**🎵 Şimdi Çalıyor:**\n${current.title} [${current.duration}]\n\n`;
        
        if (upcoming.length > 0) {
            description += '**📋 Sıradakiler:**\n';
            upcoming.forEach((song, i) => {
                description += `${i + 1}. ${song.title} [${song.duration}]\n`;
            });
        }

        if (queue.songs.length > 11) {
            description += `\n*...ve ${queue.songs.length - 11} şarkı daha*`;
        }

        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('📋 Müzik Kuyruğu')
            .setDescription(description);

        message.reply({ embeds: [embed] });
    }

    // PAUSE komutu
    if (command === 'pause') {
        const queue = getQueue(message.guild.id);
        if (!queue.player) {
            return message.reply('❌ Çalan bir şarkı yok!');
        }
        
        queue.player.pause();
        message.reply('⏸️ Duraklatıldı!');
    }

    // RESUME komutu
    if (command === 'resume') {
        const queue = getQueue(message.guild.id);
        if (!queue.player) {
            return message.reply('❌ Çalan bir şarkı yok!');
        }
        
        queue.player.unpause();
        message.reply('▶️ Devam ediyor!');
    }

    // NOWPLAYING komutu
    if (command === 'nowplaying' || command === 'np') {
        const queue = getQueue(message.guild.id);
        if (queue.songs.length === 0) {
            return message.reply('❌ Şu anda çalan bir şarkı yok!');
        }

        const song = queue.songs[0];
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('🎵 Şimdi Çalıyor')
            .setDescription(`**${song.title}**`)
            .addFields(
                { name: 'Süre', value: song.duration, inline: true },
                { name: 'İsteyen', value: song.requestedBy, inline: true }
            )
            .setThumbnail(song.thumbnail);

        message.reply({ embeds: [embed] });
    }

    // HELP komutu
    if (command === 'help') {
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('🎵 Müzik Botu Komutları')
            .setDescription('Aşağıdaki komutları kullanabilirsin:')
            .addFields(
                { name: '!play <şarkı>', value: 'YouTube\'dan müzik çal', inline: true },
                { name: '!skip', value: 'Şarkıyı atla', inline: true },
                { name: '!stop', value: 'Müziği durdur', inline: true },
                { name: '!queue', value: 'Sırayı göster', inline: true },
                { name: '!pause', value: 'Duraklat', inline: true },
                { name: '!resume', value: 'Devam et', inline: true },
                { name: '!nowplaying', value: 'Çalan şarkıyı göster', inline: true }
            )
            .setFooter({ text: 'Örnek: !play never gonna give you up' });

        message.reply({ embeds: [embed] });
    }
});

const token = process.env.DISCORD_TOKEN;

if (!token) {
    console.error('❌ DISCORD_TOKEN bulunamadı!');
    process.exit(1);
}

client.login(token);
