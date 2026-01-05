const { Client, GatewayIntentBits } = require('discord.js');
const { DisTube } = require('distube');
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

const distube = new DisTube(client, {
    emitNewSongOnly: true,
    leaveOnEmpty: true,
    leaveOnFinish: false,
    leaveOnStop: true
});

distube.on('playSong', (queue, song) => {
    queue.textChannel.send(`🎵 **Şimdi Çalıyor:** ${song.name} - \`${song.formattedDuration}\``);
});

distube.on('error', (channel, error) => {
    console.error('❌ DisTube hatası:', error);
    if (channel) channel.send('❌ Bir hata oluştu!');
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
            await distube.play(message.member.voice.channel, query, {
                member: message.member,
                textChannel: message.channel,
                message
            });
            message.reply('🔍 Aranıyor ve çalınıyor...');
        } catch (error) {
            console.error(error);
            message.reply('❌ Şarkı çalarken bir hata oluştu!');
        }
    }

    if (command === 'skip' || command === 's') {
        const queue = distube.getQueue(message);
        if (!queue) return message.reply('❌ Çalan bir şarkı yok!');
        
        try {
            await distube.skip(message);
            message.reply('⏭️ Şarkı atlandı!');
        } catch {
            message.reply('❌ Atlanacak şarkı yok!');
        }
    }

    if (command === 'stop') {
        const queue = distube.getQueue(message);
        if (!queue) return message.reply('❌ Çalan bir şarkı yok!');
        
        await distube.stop(message);
        message.reply('⏹️ Müzik durduruldu!');
    }

    if (command === 'queue' || command === 'q') {
        const queue = distube.getQueue(message);
        if (!queue) return message.reply('❌ Kuyruk boş!');

        const currentSong = queue.songs[0];
        const queueSongs = queue.songs.slice(1, 11);

        let queueMessage = `**📋 Müzik Kuyruğu:**\n\n🎵 **Şimdi Çalıyor:** ${currentSong.name}\n\n`;
        
        queueSongs.forEach((song, i) => {
            queueMessage += `${i + 1}. ${song.name}\n`;
        });

        if (queue.songs.length > 11) {
            queueMessage += `\n*...ve ${queue.songs.length - 11} şarkı daha*`;
        }

        message.reply(queueMessage);
    }

    if (command === 'pause') {
        const queue = distube.getQueue(message);
        if (!queue) return message.reply('❌ Çalan bir şarkı yok!');
        
        if (queue.paused) {
            distube.resume(message);
            message.reply('▶️ Devam ediyor');
        } else {
            distube.pause(message);
            message.reply('⏸️ Duraklatıldı');
        }
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
