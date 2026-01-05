const { Client, GatewayIntentBits } = require('discord.js');
const { Player } = require('discord-player');
const { YoutubeiExtractor } = require('discord-player-youtubei');
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
    console.log(`✅ Web sunucusu ${PORT} portunda çalışıyor`);
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const player = new Player(client);

player.extractors.register(YoutubeiExtractor, {});

player.events.on('playerStart', (queue, track) => {
    queue.metadata.channel.send(`🎵 **Şimdi Çalıyor:** ${track.title}`);
});

player.events.on('error', (queue, error) => {
    console.error('❌ Player hatası:', error);
    queue.metadata.channel.send('❌ Müzik çalarken bir hata oluştu!');
});

client.once('ready', () => {
    console.log(`✅ Bot hazır! ${client.user.tag} olarak giriş yapıldı`);
    console.log(`📊 ${client.guilds.cache.size} sunucuda aktif`);
});

client.on('messageCreate', async message => {
    if (message.author.bot || !message.content.startsWith('!')) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'play' || command === 'p') {
        if (!message.member.voice.channel) {
            return message.reply('❌ Önce bir ses kanalına katılmalısın!');
        }

        if (!args.length) {
            return message.reply('❌ Lütfen bir YouTube linki veya şarkı adı gir!\n**Örnek:** `!play never gonna give you up`');
        }

        const query = args.join(' ');

        try {
            const searchResult = await player.search(query, {
                requestedBy: message.author
            });

            if (!searchResult || !searchResult.tracks.length) {
                return message.reply('❌ Hiçbir sonuç bulunamadı!');
            }

            const queue = player.nodes.create(message.guild, {
                metadata: {
                    channel: message.channel
                },
                leaveOnEmptyCooldown: 60000,
                leaveOnEmpty: true,
                leaveOnEnd: false
            });

            try {
                if (!queue.connection) await queue.connect(message.member.voice.channel);
            } catch {
                queue.delete();
                return message.reply('❌ Ses kanalına bağlanılamadı!');
            }

            searchResult.playlist ? queue.addTrack(searchResult.tracks) : queue.addTrack(searchResult.tracks[0]);

            if (!queue.isPlaying()) await queue.node.play();

            message.reply(searchResult.playlist 
                ? `✅ **${searchResult.tracks.length}** şarkı sıraya eklendi!`
                : `✅ **${searchResult.tracks[0].title}** sıraya eklendi!`
            );
        } catch (error) {
            console.error(error);
            message.reply('❌ Bir hata oluştu!');
        }
    }

    if (command === 'skip' || command === 's') {
        const queue = player.nodes.get(message.guild);
        if (!queue || !queue.isPlaying()) {
            return message.reply('❌ Çalan bir şarkı yok!');
        }
        queue.node.skip();
        message.reply('⏭️ Şarkı atlandı!');
    }

    if (command === 'stop') {
        const queue = player.nodes.get(message.guild);
        if (!queue) return message.reply('❌ Çalan bir şarkı yok!');
        queue.delete();
        message.reply('⏹️ Müzik durduruldu!');
    }

    if (command === 'queue' || command === 'q') {
        const queue = player.nodes.get(message.guild);
        if (!queue || !queue.isPlaying()) {
            return message.reply('❌ Kuyruk boş!');
        }

        const currentTrack = queue.currentTrack;
        const tracks = queue.tracks.toArray().slice(0, 10);

        let queueMessage = `**📋 Müzik Kuyruğu:**\n\n🎵 **Şimdi Çalıyor:** ${currentTrack.title}\n\n`;
        
        tracks.forEach((track, i) => {
            queueMessage += `${i + 1}. ${track.title}\n`;
        });

        if (queue.tracks.size > 10) {
            queueMessage += `\n*...ve ${queue.tracks.size - 10} şarkı daha*`;
        }

        message.reply(queueMessage);
    }

    if (command === 'pause') {
        const queue = player.nodes.get(message.guild);
        if (!queue) return message.reply('❌ Çalan bir şarkı yok!');
        queue.node.setPaused(!queue.node.isPaused());
        message.reply(queue.node.isPaused() ? '⏸️ Duraklatıldı' : '▶️ Devam ediyor');
    }

    if (command === 'help') {
        const helpMessage = `
**🎵 Müzik Botu Komutları:**

\`!play <link veya şarkı adı>\` - YouTube'dan müzik çal
\`!skip\` - Şarkıyı atla
\`!stop\` - Müziği durdur
\`!queue\` - Sırayı göster
\`!pause\` - Duraklat/Devam et
\`!help\` - Bu mesajı göster

**Örnek:**
\`!play never gonna give you up\`
\`!play https://www.youtube.com/watch?v=dQw4w9WgXcQ\`
        `;
        message.reply(helpMessage);
    }
});

const token = process.env.DISCORD_TOKEN;

if (!token) {
    console.error('❌ DISCORD_TOKEN bulunamadı!');
    process.exit(1);
}

client.login(token);
