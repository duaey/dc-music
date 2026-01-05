const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, StreamType } = require('@discordjs/voice');
const ytdl = require('@distube/ytdl-core');
const express = require('express');

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
    console.log(`Web sunucusu ${PORT} portunda çalışıyor`);
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const queue = new Map();

client.once('ready', () => {
    console.log(`✅ Bot hazır! ${client.user.tag} olarak giriş yapıldı`);
    console.log(`📊 ${client.guilds.cache.size} sunucuda aktif`);
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith('!')) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'play' || command === 'p') {
        if (!message.member.voice.channel) {
            return message.reply('❌ Önce bir ses kanalına katılmalısın!');
        }

        if (!args.length) {
            return message.reply('❌ Lütfen bir YouTube linki gir!\n**Örnek:** `!play https://www.youtube.com/watch?v=...`');
        }

        const url = args[0];
        
        if (!ytdl.validateURL(url)) {
            return message.reply('❌ Geçerli bir YouTube linki değil!');
        }

        message.reply('🔍 Şarkı bilgileri alınıyor...').then(async msg => {
            try {
                const serverQueue = queue.get(message.guild.id);
                
                let info;
                try {
                    info = await ytdl.getInfo(url);
                } catch (err) {
                    console.error('Video info hatası:', err);
                    return msg.edit('❌ Video bilgisi alınamadı. Video özel veya kısıtlı olabilir.');
                }

                const song = {
                    title: info.videoDetails.title,
                    url: info.videoDetails.video_url,
                    duration: info.videoDetails.lengthSeconds,
                };

                if (!serverQueue) {
                    const queueConstruct = {
                        voiceChannel: message.member.voice.channel,
                        connection: null,
                        player: null,
                        songs: [],
                        playing: true
                    };

                    queue.set(message.guild.id, queueConstruct);
                    queueConstruct.songs.push(song);

                    try {
                        const connection = joinVoiceChannel({
                            channelId: message.member.voice.channel.id,
                            guildId: message.guild.id,
                            adapterCreator: message.guild.voiceAdapterCreator,
                        });

                        queueConstruct.connection = connection;
                        queueConstruct.player = createAudioPlayer();
                        connection.subscribe(queueConstruct.player);

                        playSong(message.guild, queueConstruct.songs[0]);
                        msg.edit(`🎵 **Şimdi Çalıyor:**\n${song.title}`);
                    } catch (err) {
                        console.error(err);
                        queue.delete(message.guild.id);
                        msg.edit('❌ Ses kanalına bağlanırken bir hata oluştu!');
                    }
                } else {
                    serverQueue.songs.push(song);
                    msg.edit(`✅ **Sıraya Eklendi:**\n${song.title}\n*Sıra: ${serverQueue.songs.length}*`);
                }
            } catch (error) {
                console.error(error);
                msg.edit('❌ Şarkı bilgileri alınırken hata oluştu!');
            }
        });
    }

    if (command === 'skip' || command === 's') {
        const serverQueue = queue.get(message.guild.id);
        if (!serverQueue) return message.reply('❌ Çalan bir şarkı yok!');
        if (!message.member.voice.channel) return message.reply('❌ Ses kanalında değilsin!');
        
        serverQueue.player.stop();
        message.reply('⏭️ Şarkı atlandı!');
    }

    if (command === 'stop' || command === 'leave') {
        const serverQueue = queue.get(message.guild.id);
        if (!serverQueue) return message.reply('❌ Çalan bir şarkı yok!');
        if (!message.member.voice.channel) return message.reply('❌ Ses kanalında değilsin!');

        serverQueue.songs = [];
        serverQueue.player.stop();
        serverQueue.connection.destroy();
        queue.delete(message.guild.id);
        message.reply('⏹️ Müzik durduruldu ve bot ayrıldı!');
    }

    if (command === 'queue' || command === 'q') {
        const serverQueue = queue.get(message.guild.id);
        if (!serverQueue || serverQueue.songs.length === 0) {
            return message.reply('❌ Kuyruk boş!');
        }

        let queueMessage = '**📋 Müzik Kuyruğu:**\n\n';
        serverQueue.songs.slice(0, 10).forEach((song, index) => {
            if (index === 0) {
                queueMessage += `🎵 **Şimdi Çalıyor:** ${song.title}\n\n`;
            } else {
                queueMessage += `${index}. ${song.title}\n`;
            }
        });
        
        if (serverQueue.songs.length > 10) {
            queueMessage += `\n*...ve ${serverQueue.songs.length - 10} şarkı daha*`;
        }
        
        message.reply(queueMessage);
    }

    if (command === 'nowplaying' || command === 'np') {
        const serverQueue = queue.get(message.guild.id);
        if (!serverQueue) return message.reply('❌ Çalan bir şarkı yok!');
        
        message.reply(`🎵 **Şimdi Çalıyor:**\n${serverQueue.songs[0].title}`);
    }

    if (command === 'help' || command === 'yardim') {
        const helpMessage = `
**🎵 Müzik Botu Komutları:**

\`!play <youtube_link>\` veya \`!p\` - YouTube'dan müzik çal
\`!skip\` veya \`!s\` - Şarkıyı atla
\`!stop\` veya \`!leave\` - Müziği durdur ve botu çıkar
\`!queue\` veya \`!q\` - Sıradaki şarkıları göster
\`!nowplaying\` veya \`!np\` - Şu an çalan şarkıyı göster
\`!help\` - Bu yardım mesajını göster

**Örnek Kullanım:**
\`!play https://www.youtube.com/watch?v=dQw4w9WgXcQ\`
        `;
        message.reply(helpMessage);
    }
});

async function playSong(guild, song) {
    const serverQueue = queue.get(guild.id);
    if (!song) {
        setTimeout(() => {
            if (serverQueue.connection) {
                serverQueue.connection.destroy();
            }
            queue.delete(guild.id);
        }, 1000);
        return;
    }

    try {
        console.log(`🎵 Çalınıyor: ${song.title}`);
        
        const stream = ytdl(song.url, {
            filter: 'audioonly',
            quality: 'highestaudio',
            highWaterMark: 1 << 25,
            dlChunkSize: 0
        });
        
        const resource = createAudioResource(stream, {
            inputType: StreamType.Arbitrary,
            inlineVolume: true
        });
        
        serverQueue.player.play(resource);

        serverQueue.player.once(AudioPlayerStatus.Idle, () => {
            console.log('⏭️ Şarkı bitti, sıradaki çalınıyor...');
            serverQueue.songs.shift();
            playSong(guild, serverQueue.songs[0]);
        });

        serverQueue.player.on('error', error => {
            console.error('❌ Player hatası:', error);
            serverQueue.songs.shift();
            playSong(guild, serverQueue.songs[0]);
        });
        
        stream.on('error', error => {
            console.error('❌ Stream hatası:', error);
            serverQueue.songs.shift();
            playSong(guild, serverQueue.songs[0]);
        });
    } catch (error) {
        console.error('❌ Çalma hatası:', error);
        console.error('Hata detayı:', error.message);
        serverQueue.songs.shift();
        
        if (serverQueue.songs.length > 0) {
            playSong(guild, serverQueue.songs[0]);
        } else {
            setTimeout(() => {
                if (serverQueue.connection) {
                    serverQueue.connection.destroy();
                }
                queue.delete(guild.id);
            }, 1000);
        }
    }
}

const token = process.env.DISCORD_TOKEN;

if (!token) {
    console.error('❌ DISCORD_TOKEN environment variable bulunamadı!');
    process.exit(1);
}

client.login(token).catch(err => {
    console.error('❌ Bot girişi başarısız:', err);
    process.exit(1);
});

process.on('unhandledRejection', error => {
    console.error('Yakalanmamış hata:', error);
});
