import TelegramBot from 'node-telegram-bot-api'
import registerActions from './botActions.mjs'
const TOKEN = process.env.TELEGRAM_BOT_API_KEY

const bot = new TelegramBot(TOKEN, { polling: true })
bot.say = (chatId, message) => bot.sendMessage(chatId, message, { parse_mode: 'Markdown' })

bot.processButtons = (buttons, noCancel) => {
  const rows = []
  if (buttons.length > 9) buttons.length = 9
  if (!noCancel) {
    buttons.push({
      text: 'Cancel',
      callback_data: '/cancel'
    })
  }
  while (buttons.length) {
    rows.push(buttons.splice(0, 4))
  }
  return {
    inline_keyboard: rows
  }
}

bot.upsertMessage = async (chatId, message, buttons, messageId, noCancel = false) => {
  const options = {
    reply_markup: bot.processButtons(buttons, noCancel),
    parse_mode: 'Markdown'
  }
  if (!messageId) {
    return bot.sendMessage(
      chatId,
      message,
      options
    )
  }
  bot.editMessageText(
    message,
    {
      ...options,
      chat_id: chatId,
      message_id: messageId
    }
  )
}

registerActions(bot)

bot.on('message', async (msg) => {
  if (!msg.text) return
  const chatId = msg.chat.id
  const [command, ...params] = msg.text.split(' ')
  if (bot.actions[command]) bot.actions[command](params, chatId)
})

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id
  const messageId = query.message.message_id
  const userId = query.from.id
  const [command, ...params] = query.data.split(' ')
  if (bot.actions[command]) bot.actions[command](params, chatId, messageId, userId)
  bot.answerCallbackQuery(query.id)
})
