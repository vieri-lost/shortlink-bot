import os
import json
import requests
import telebot
from telebot import types
from dotenv import load_dotenv
from flask import Flask
from threading import Thread

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN")

bot = telebot.TeleBot(BOT_TOKEN)

DATA_FILE = "database.json"

# =========================
# WEB SERVER RAILWAY
# =========================
app = Flask(__name__)

@app.route('/')
def home():
    return "Bot TinyURL Aktif"

def run_web():
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)

# =========================
# DATABASE
# =========================
def load_data():
    if not os.path.exists(DATA_FILE):
        return {}

    with open(DATA_FILE, "r") as f:
        return json.load(f)

def save_data(data):
    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=4)

# =========================
# MENU
# =========================
def main_menu():
    markup = types.ReplyKeyboardMarkup(resize_keyboard=True)

    btn1 = types.KeyboardButton("🔗 Single Shortlink")
    btn2 = types.KeyboardButton("📦 Bulk Shortlink")
    btn3 = types.KeyboardButton("📜 Riwayat Link")
    btn4 = types.KeyboardButton("📊 Total Klik")
    btn5 = types.KeyboardButton("🗑 Delete Link")

    markup.add(btn1)
    markup.add(btn2)
    markup.add(btn3, btn4)
    markup.add(btn5)

    return markup

# =========================
# START
# =========================
@bot.message_handler(commands=['start'])
def start(message):
    bot.send_message(
        message.chat.id,
        "👋 Selamat datang di Bot TinyURL",
        reply_markup=main_menu()
    )

# =========================
# SINGLE SHORTLINK
# =========================
@bot.message_handler(func=lambda m: m.text == "🔗 Single Shortlink")
def single_link(message):
    msg = bot.send_message(
        message.chat.id,
        "Kirim link yang ingin dipendekkan:"
    )

    bot.register_next_step_handler(msg, process_single)

def process_single(message):
    long_url = message.text.strip()

    api = f"https://tinyurl.com/api-create.php?url={long_url}"

    try:
        response = requests.get(api)

        short_url = response.text

        user_id = str(message.from_user.id)

        data = load_data()

        if user_id not in data:
            data[user_id] = []

        number = len(data[user_id]) + 1

        data[user_id].append({
            "id": number,
            "original": long_url,
            "short": short_url,
            "clicks": 0
        })

        save_data(data)

        bot.send_message(
            message.chat.id,
            f"✅ Shortlink berhasil dibuat\n\n{short_url}",
            reply_markup=main_menu()
        )

    except Exception as e:
        bot.send_message(
            message.chat.id,
            f"❌ Error:\n{e}"
        )

# =========================
# BULK SHORTLINK
# =========================
@bot.message_handler(func=lambda m: m.text == "📦 Bulk Shortlink")
def bulk_link(message):
    msg = bot.send_message(
        message.chat.id,
        "Kirim banyak link.\nPisahkan per baris."
    )

    bot.register_next_step_handler(msg, process_bulk)

def process_bulk(message):
    urls = message.text.strip().splitlines()

    user_id = str(message.from_user.id)

    data = load_data()

    if user_id not in data:
        data[user_id] = []

    results = []

    for url in urls:
        try:
            api = f"https://tinyurl.com/api-create.php?url={url}"
            response = requests.get(api)

            short_url = response.text

            number = len(data[user_id]) + 1

            data[user_id].append({
                "id": number,
                "original": url,
                "short": short_url,
                "clicks": 0
            })

            results.append(f"{number}. {short_url}")

        except:
            results.append(f"❌ Gagal: {url}")

    save_data(data)

    bot.send_message(
        message.chat.id,
        "✅ Bulk selesai\n\n" + "\n".join(results),
        reply_markup=main_menu()
    )

# =========================
# RIWAYAT
# =========================
@bot.message_handler(func=lambda m: m.text == "📜 Riwayat Link")
def history(message):
    user_id = str(message.from_user.id)

    data = load_data()

    if user_id not in data or len(data[user_id]) == 0:
        bot.send_message(
            message.chat.id,
            "📭 Riwayat kosong",
            reply_markup=main_menu()
        )
        return

    text = "📜 Riwayat Link:\n\n"

    for item in data[user_id]:
        text += (
            f"{item['id']}. {item['short']}\n"
            f"🔗 {item['original']}\n\n"
        )

    bot.send_message(
        message.chat.id,
        text,
        reply_markup=main_menu()
    )

# =========================
# TOTAL KLIK
# =========================
@bot.message_handler(func=lambda m: m.text == "📊 Total Klik")
def total_click(message):
    user_id = str(message.from_user.id)

    data = load_data()

    if user_id not in data or len(data[user_id]) == 0:
        bot.send_message(
            message.chat.id,
            "📭 Tidak ada data",
            reply_markup=main_menu()
        )
        return

    text = "📊 Total Klik:\n\n"

    for item in data[user_id]:
        text += (
            f"{item['id']}. {item['short']}\n"
            f"👆 Klik: {item['clicks']}\n\n"
        )

    bot.send_message(
        message.chat.id,
        text,
        reply_markup=main_menu()
    )

# =========================
# DELETE
# =========================
@bot.message_handler(func=lambda m: m.text == "🗑 Delete Link")
def delete_menu(message):
    msg = bot.send_message(
        message.chat.id,
        "Kirim nomor link yang ingin dihapus"
    )

    bot.register_next_step_handler(msg, process_delete)

def process_delete(message):
    user_id = str(message.from_user.id)

    try:
        number = int(message.text)

    except:
        bot.send_message(
            message.chat.id,
            "❌ Nomor tidak valid"
        )
        return

    data = load_data()

    if user_id not in data:
        bot.send_message(
            message.chat.id,
            "❌ Data tidak ditemukan"
        )
        return

    links = data[user_id]

    new_links = [x for x in links if x["id"] != number]

    for i, item in enumerate(new_links, start=1):
        item["id"] = i

    data[user_id] = new_links

    save_data(data)

    bot.send_message(
        message.chat.id,
        f"✅ Link nomor {number} berhasil dihapus",
        reply_markup=main_menu()
    )

# =========================
# RUN
# =========================
if __name__ == "__main__":
    Thread(target=run_web).start()

    print("Bot berjalan...")
    bot.infinity_polling()
