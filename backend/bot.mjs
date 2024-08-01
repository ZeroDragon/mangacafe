import TelegramBot from 'node-telegram-bot-api'
const token = process.env.TELEGRAM_TOKEN
const bot = new TelegramBot(token, { polling: true })
import user from './user.mjs'

const successLogin = (chatId, msg = 'How I we help you?') => {
  bot.sendMessage(chatId, msg, {
    reply_markup: {
      inline_keyboard: [[
        { text: 'Change password', callback_data: 'changepassword' },
        { text: 'Change phone', callback_data: 'changephone' },
        { text: 'Good bye', callback_data: 'bye' }
      ]]
    }
  })
}

const queryUser = async (bot, chatId, message) => {
  const outmsg = await bot.sendMessage(chatId, `${message}. type /cancel to stop`, { reply_markup: { remove_keyboard: true } })
  return await new Promise(resolve => {
    let timedOut = false
    const timer = setTimeout(() => {
      bot.sendMessage(chatId, 'Query cancelled by timeout')
      timedOut = true
      return resolve(null)
    }, 1000 * 60 * 5)
    bot.once('message', async msg => {
      clearTimeout(timer)
      bot.deleteMessage(chatId, outmsg.message_id)
      bot.deleteMessage(chatId, msg.message_id)
      if (msg.text.trim() === '/cancel') {
        bot.sendMessage(msg.chat.id, 'Query cancelled')
        return resolve(null)
      }
      if (timedOut) return
      resolve(msg.text.trim())
    })
  })
}

bot.onText(/^\/(start|help)$|^help$/i, async msg => {
  const chatId = msg.chat.id
  const telegramId = msg.from.id
  const { error, data } = await user.getBy('telegram_id', telegramId)
  if (error) return bot.sendMessage(msg.chat.id, 'Oops an error occured, try again later')
  if (!data) {
    return bot.sendMessage(chatId, 'We cannot match your telegram account to any account in our database do you have an account?', {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'I do not have one', callback_data: 'signup' },
            { text: 'Login with password', callback_data: 'loginWithPassword' }
          ],
          [
            { text: 'Login with phone number', callback_data: 'login' }
          ]
        ]
      }
    })
  }
  successLogin(chatId)
})

bot.onText(/^\/logout$/i, async msg => {
  const chatId = msg.chat.id
  const telegramId = msg.from.id
  const { error } = await user.update('telegram_id', null, 'telegram_id', telegramId)
  if (error) return bot.sendMessage(msg.chat.id, 'Oops an error occured, try again later')
  bot.sendMessage(chatId, 'You have been logged out')
})

bot.on('callback_query', async query => {
  bot.answerCallbackQuery(query.id)
  const chatId = query.message.chat.id
  const messageId = query.message.message_id
  const data = query.data
  const telegramId = query.from.id
  bot.deleteMessage(chatId, messageId)
  switch (data) {
    case 'signup':
      bot.sendMessage(chatId, 'To signup visit http://mangacafe.vip')
      break
    case 'login':
      bot.sendMessage(chatId, 'Alright, just send your phone number', {
        reply_markup: {
          keyboard: [[
            { text: 'Share phone number', request_contact: true }
          ]],
          resize_keyboard: true,
          one_time_keyboard: true
        }
      })
      break
    case 'loginWithPassword':
      const username = await queryUser(bot, chatId, 'What is your username?')
      const password = await queryUser(bot, chatId, 'What is your password?')
      if (!username || !password) return
      const { error, success } = await user.login(username, password)
      if (error) return bot.sendMessage(chatId, error)
      if (!success) return bot.sendMessage(chatId, 'Invalid username or password')
      const { error: updateError } = await user.update('telegram_id', telegramId, 'username', username)
      if (updateError) return bot.sendMessage(chatId, 'Oops an error occured, try again later')
      successLogin(chatId, 'Successfully logged in, how can I help you?')
      break
    case 'changephone':
      const phone = await queryUser(bot, chatId, 'What is your phone number? Remember to use international format e.g +2348012345678')
      if (!phone) return
      const { error: updateError2 } = await user.update('phone', phone, 'telegram_id', telegramId)
      if (updateError2) return bot.sendMessage(chatId, 'Oops an error occured, try again later')
      successLogin(chatId, 'Phone updated successfully, Can I help you with something else?')
      break
    case 'changepassword':
      const newPassword = await queryUser(bot, chatId, 'What is your new password?')
      if (!newPassword) return
      const { error: updateError3 } = await user.changePassword(telegramId, newPassword)
      if (updateError3) return bot.sendMessage(msg.chat.id, 'Oops an error occured, try again later')
      successLogin(chatId, 'Password updated successfully. Can I help you with something else?')
      break
    case 'bye':
      bot.sendMessage(chatId, 'Good bye')
      break
  }
})

bot.once('contact', async (msg) => {
  const chatId = msg.chat.id
  const { phone_number } = msg.contact
  const telegramId = msg.from.id
  const { error, data } = await user.getBy('phone', phone_number)
  if (error) return bot.sendMessage(chatId, 'Oops an error occured, try again later')
  if (!data) {
    // user does not exists in the database needs to login
    return bot.sendMessage(chatId, 'This phone number does not match any records. If you do have an account it looks like you entered a wrong phone number when signing up. You can change your phone number by logging in with your username and password', {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'I do not have an account', callback_data: 'signup' }
          ],
          [
            { text: 'Login with username and password', callback_data: 'loginWithPassword' }
          ]
        ]
      }
    })
  }
  const { error: signupError } = await user.update('telegram_id', telegramId, 'phone', phone_number)
  if (signupError) return bot.sendMessage(chatId, 'Oops an error occured, try again later')
  successLogin(chatId, 'Phone number matched successfully, how can I help you?')
})
