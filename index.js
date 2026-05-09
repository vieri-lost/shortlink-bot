const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();

const token = process.env.BOT_TOKEN;
const apiKey = process.env.API_KEY;

const bot = new TelegramBot(token, { polling: true });

const db = new sqlite3.Database('./shortlink.db');

db.run(`
CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    original TEXT,
    short TEXT,
    clicks INTEGER DEFAULT 0
)
`);

function isUrl(text) {
    return text.startsWith('http://') || text.startsWith('https://');
}

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(
        msg.chat.id,
        `🤖 Bot Shortlink Aktif

Kirim:
• 1 link
• atau banyak link sekaligus

Contoh:

https://google.com
https://youtube.com`
    );
});

bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;

    const chatId = msg.chat.id;

    const lines = msg.text
        .split('\n')
        .map(v => v.trim())
        .filter(v => isUrl(v));

    if (lines.length < 1) {
        return bot.sendMessage(chatId, '❌ Link tidak valid');
    }

    bot.sendMessage(chatId, '⏳ Membuat shortlink...');

    let result = '';

    for (const link of lines) {
        try {
            const res = await axios.post(
                'https://shortten.net/api/url/add',
                {
                    url: link
                },
                {
                    headers: {
                        'x-api-key': apiKey
                    }
                }
            );

            const short = res.data.shortenedUrl || 'gagal';

            db.run(
                `INSERT INTO links(user_id, original, short)
                 VALUES(?,?,?)`,
                [msg.from.id, link, short]
            );

            result += `🔗 ${short}\n\n`;

        } catch (e) {
            result += `❌ Gagal: ${link}\n\n`;
        }
    }

    bot.sendMessage(chatId, result);
});

bot.onText(/\/history/, (msg) => {
    db.all(
        `SELECT * FROM links
         WHERE user_id=?
         ORDER BY id DESC`,
        [msg.from.id],
        (err, rows) => {

            if (!rows || rows.length < 1) {
                return bot.sendMessage(
                    msg.chat.id,
                    '📂 Belum ada riwayat'
                );
            }

            let text = '📂 Riwayat Link\n\n';

            rows.forEach((row, i) => {
                text +=
`${i + 1}. ${row.short}
📊 Klik: ${row.clicks}

`;
            });

            text +=
`Hapus link:
 /delete nomor

Contoh:
 /delete 1`;

            bot.sendMessage(msg.chat.id, text);
        }
    );
});

bot.onText(/\/delete (.+)/, (msg, match) => {

    const nomor = parseInt(match[1]);

    db.all(
        `SELECT * FROM links
         WHERE user_id=?
         ORDER BY id DESC`,
        [msg.from.id],
        (err, rows) => {

            if (!rows[nomor - 1]) {
                return bot.sendMessage(
                    msg.chat.id,
                    '❌ Nomor tidak ditemukan'
                );
            }

            const id = rows[nomor - 1].id;

            db.run(
                `DELETE FROM links WHERE id=?`,
                [id]
            );

            bot.sendMessage(
                msg.chat.id,
                '✅ Link berhasil dihapus'
            );
        }
    );
});

console.log('Bot running...');
