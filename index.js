import telebot
import requests
import sqlite3
import re

from telebot.types import ReplyKeyboardMarkup, KeyboardButton

# =====================================
# CONFIG
# =====================================
import os

BOT_TOKEN = os.getenv("BOT_TOKEN")
TINY_API_KEY = os.getenv("TINY_API_KEY")

bot = telebot.TeleBot(BOT_TOKEN)

headers = {
    "Authorization": f"Bearer {TINY_API_KEY}",
    "Content-Type": "application/json"
}

# =====================================
# DATABASE
# =====================================
db = sqlite3.connect("data.db", check_same_thread=False)
cursor = db.cursor()

cursor.execute("""
CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    alias TEXT,
    short_url TEXT
)
""")

db.commit()

# =====================================
# USER STATE
# =====================================
user_state = {}

# =====================================
# MENU
# =====================================
def menu():

    markup = ReplyKeyboardMarkup(resize_keyboard=True)

    markup.row(
        KeyboardButton("🔗 Shortlink")
    )

    markup.row(
        KeyboardButton("📜 Riwayat"),
        KeyboardButton("🗑 Delete Link")
    )

    return markup

# =====================================
# START
# =====================================
@bot.message_handler(commands=['start'])
def start(message):

    user_state[message.chat.id] = None

    bot.send_message(
        message.chat.id,
        "Selamat datang di TinyURL Bot",
        reply_markup=menu()
    )

# =====================================
# SHORTLINK BUTTON
# =====================================
@bot.message_handler(func=lambda m: m.text == "🔗 Shortlink")
def shortlink_button(message):

    user_state[message.chat.id] = "short"

    bot.send_message(
        message.chat.id,
        "Kirim 1 atau banyak link.\n\n1 link per baris."
    )

# =====================================
# HISTORY BUTTON
# =====================================
@bot.message_handler(func=lambda m: m.text == "📜 Riwayat")
def history(message):

    user_state[message.chat.id] = None

    cursor.execute(
        """
        SELECT short_url, alias
        FROM links
        WHERE user_id=?
        ORDER BY id DESC
        LIMIT 10
        """,
        (message.from_user.id,)
    )

    rows = cursor.fetchall()

    if not rows:

        bot.send_message(
            message.chat.id,
            "Belum ada riwayat"
        )

        return

    text = "📜 Riwayat Link\n\n"

    for i, row in enumerate(rows, start=1):

        shorturl = row[0]
        alias = row[1]

        hits = 0

        try:

            r = requests.get(
                f"https://api.tinyurl.com/alias/{alias}",
                headers=headers
            )

            data = r.json()

            if r.status_code == 200:
                hits = data["data"].get("hits", 0)

        except:
            pass

        text += (
            f"{i}. {shorturl}\n"
            f"👆 Klik: {hits}\n\n"
        )

    bot.send_message(
        message.chat.id,
        text
    )

# =====================================
# DELETE MENU
# =====================================
@bot.message_handler(func=lambda m: m.text == "🗑 Delete Link")
def delete_menu(message):

    cursor.execute(
        """
        SELECT short_url
        FROM links
        WHERE user_id=?
        ORDER BY id DESC
        LIMIT 10
        """,
        (message.from_user.id,)
    )

    rows = cursor.fetchall()

    if not rows:

        bot.send_message(
            message.chat.id,
            "Belum ada link"
        )

        return

    text = "🗑 Delete Link\n\n"

    for i, row in enumerate(rows, start=1):

        text += f"{i}. {row[0]}\n\n"

    text += "Kirim nomor link yang ingin dihapus"

    user_state[message.chat.id] = "delete"

    bot.send_message(
        message.chat.id,
        text
    )

# =====================================
# HANDLE ALL INPUT
# =====================================
@bot.message_handler(func=lambda m: True)
def handle(message):

    state = user_state.get(message.chat.id)

    # =================================
    # SHORTLINK MODE
    # =================================
    if state == "short":

        text = message.text.strip()

        # ambil semua link
        urls = text.splitlines()

        results = []

        for long_url in urls:

            long_url = long_url.strip()

            # validasi URL
            if not re.match(r"^https?://", long_url):
                continue

            payload = {
                "url": long_url,
                "domain": "tinyurl.com"
            }

            try:

                r = requests.post(
                    "https://api.tinyurl.com/create",
                    json=payload,
                    headers=headers
                )

                data = r.json()

                if r.status_code == 200:

                    shorturl = data["data"]["tiny_url"]
                    alias = data["data"]["alias"]

                    # simpan database
                    cursor.execute(
                        """
                        INSERT INTO links (user_id, alias, short_url)
                        VALUES (?, ?, ?)
                        """,
                        (
                            message.from_user.id,
                            alias,
                            shorturl
                        )
                    )

                    db.commit()

                    results.append(shorturl)

            except:
                pass

        user_state[message.chat.id] = None

        if results:

            text_result = "✅ Shortlink Berhasil\n\n"

            for i, link in enumerate(results, start=1):

                text_result += f"{i}. {link}\n\n"

            bot.send_message(
                message.chat.id,
                text_result,
                reply_markup=menu()
            )

        else:

            bot.send_message(
                message.chat.id,
                "❌ Tidak ada link valid",
                reply_markup=menu()
            )

    # =================================
    # DELETE MODE
    # =================================
    elif state == "delete":

        try:

            nomor = int(message.text)

            cursor.execute(
                """
                SELECT id
                FROM links
                WHERE user_id=?
                ORDER BY id DESC
                LIMIT 10
                """,
                (message.from_user.id,)
            )

            rows = cursor.fetchall()

            if nomor < 1 or nomor > len(rows):

                bot.send_message(
                    message.chat.id,
                    "Nomor tidak valid"
                )

                return

            db_id = rows[nomor - 1][0]

            cursor.execute(
                "DELETE FROM links WHERE id=?",
                (db_id,)
            )

            db.commit()

            user_state[message.chat.id] = None

            bot.send_message(
                message.chat.id,
                "✅ Link berhasil dihapus",
                reply_markup=menu()
            )

        except:

            bot.send_message(
                message.chat.id,
                "Masukkan nomor yang valid"
            )

# =====================================
# RUN BOT
# =====================================
print("Bot aktif...")
bot.infinity_polling()
