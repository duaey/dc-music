const { Client, GatewayIntentBits } = require('discord.js');
const { Manager } = require('erela.js');
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

const manager = new Manager({
    nodes: [
        {
            host: 'lava-v3.ajieblogs.eu.org',
            port: 80,
            password: 'https://dsc.gg/ajidevserver'
        }
    ],
    send: (id, payload) => {
        const guild = client.guilds.cache.get(id);
        if (guild) guild.shard.send(payload);
    }
});

manager.on('nodeConnect', node => {
    console.log(`✅ Lavalink node bağlandı: ${node.options.host}`);
});

manager.on('nodeError', (node, error) => {
    console.error(`❌ Lavalink hatası [${node.options.host}]:`, error.message);
});

manager.on('trackStart', (player, track) => {
    const channel = client.channels.cache.get(player.textChannel);
    channel.send(`🎵 **Şimdi Çalıyor:** ${track.title}`);
});

manager.on('queueEnd', player => {
    const channel = client.channels.cache.get(player.textChannel);
    channel.send('✅ Kuyruk bitti!');
    player.destroy();
});

client.once('ready', () => {
    console.log(`✅ Bot hazır! ${client.user.tag} olarak giriş yapıldı`);
    console.log(`📊 ${client.guilds.cache.size} sunucuda aktif`);
    manager.init(client.user.id);
});

client.on('raw', d => manager.updateVoiceState(d));

client.on('messageCreate', async message => {
    if (message.author.bot || !message.content.startsWith('!')) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'play' || command === 'p') {
        if (!message.member.voice.channel) {
            return message.reply('❌ Önce bir ses kanalına katılmalısın!');
        }

        if (!args.length) {
            return message.reply('❌ Lütfen bir YouTube linki veya şarkı adı gir!');
        }

        const query = args.join(' ');

        let player = manager.players.get(message.guild.id);

        if (!player) {
            player = manager.create({
                guild: message.guild.id,
                voiceChannel: message.member.voice.channel.id,
                textChannel: message.channel.id,
                selfDeafen: true
            });
        }

        if (player.state !== 'CONNECTED') player.connect();

        const res = await manager.search(query, message.author);

        if (res.loadType === 'LOAD_FAILED') {
            return message.reply('❌ Şarkı yüklenemedi!');
        }

        if (res.loadType === 'NO_MATCHES') {
            return message.reply('❌ Hiçbir sonuç bulunamadı!');
        }

        if (res.loadType === 'PLAYLIST_LOADED') {
            player.queue.add(res.tracks);
            message.reply(`✅ **${res.playlist.name}** playlist'i eklendi! (${res.tracks.length} şarkı)`);
        } else {
            player.queue.add(res.tracks[0]);
            message.reply(`✅ **${res.tracks[0].title}** sıraya eklendi!`);
        }

        if (!player.playing && !player.paused && !player.queue.size) {
            player.play();
        } else if (!player.playing && !player.paused) {
            player.play();
        }
    }

    if (command === 'skip' || command === 's') {
        const player = manager.players.get(message.guild.id);
        if (!player) return message.reply('❌ Çalan bir şarkı yok!');
        
        player.stop();
        message.reply('⏭️ Şarkı atlandı!');
    }

    if (command === 'stop') {
        const player = manager.players.get(message.guild.id);
        if (!player) return message.reply('❌ Çalan bir şarkı yok!');
        
        player.destroy();
        message.reply('⏹️ Müzik durduruldu!');
    }

    if (command === 'queue' || command === 'q') {
        const player = manager.players.get(message.guild.id);
        if (!player) return message.reply('❌ Kuyruk boş!');

        const queue = player.queue;
        const current = queue.current;
        const tracks = queue.slice(0, 10);

        let queueMessage = `**📋 Müzik Kuyruğu:**\n\n🎵 **Şimdi Çalıyor:** ${current.title}\n\n`;
        
        tracks.forEach((track, i) => {
            queueMessage += `${i + 1}. ${track.title}\n`;
        });

        if (queue.length > 10) {
            queueMessage += `\n*...ve ${queue.length - 10} şarkı daha*`;
        }

        message.reply(queueMessage);
    }

    if (command === 'pause') {
        const player = manager.players.get(message.guild.id);
        if (!player) return message.reply('❌ Çalan bir şarkı yok!');
        
        player.pause(!player.paused);
        message.reply(player.paused ? '⏸️ Duraklatıldı' : '▶️ Devam ediyor');
    }

    if (command === 'volume' || command === 'vol') {
        const player = manager.players.get(message.guild.id);
        if (!player) return message.reply('❌ Çalan bir şarkı yok!');

        if (!args.length) {
            return message.reply(`🔊 Ses seviyesi: **${player.volume}%**`);
        }

        const volume = Number(args[0]);
        if (isNaN(volume) || volume < 0 || volume > 100) {
            return message.reply('❌ 0-100 arası bir değer gir!');
        }

        player.setVolume(volume);
        message.reply(`🔊 Ses seviyesi: **${volume}%**`);
    }

    if (command === 'help') {
        const helpMessage = `
**🎵 Müzik Botu Komutları:**

\`!play <link veya şarkı adı>\` - YouTube'dan müzik çal
\`!skip\` - Şarkıyı atla
\`!stop\` - Müziği durdur
\`!queue\` - Sırayı göster
\`!pause\` - Duraklat/Devam et
\`!volume <0-100>\` - Ses seviyesi
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
