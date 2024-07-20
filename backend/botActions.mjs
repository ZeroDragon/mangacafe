import mangaData from './fetcher.mjs'
import searchManga from './search.mjs'
import registerUserActions from './userActions.mjs'

let bot = null

const actions = {
  '/start': (_params, chatId) => {
    const keyboard = {
      inline_keyboard: [
        [{
          text: 'Search for a manga',
          callback_data: '/search'
        },{
          text: 'My lists',
          callback_data: '/myLists'
        }]
      ]
    }
    bot.sendMessage(chatId, 'What can I do for you:', { reply_markup: keyboard })
  },
  '/cancel': (_params, chatId, messageId) => {
    if (messageId) bot.deleteMessage(chatId, messageId)
    actions['/start']([], chatId)
  },
  '/search': async (params, chatId, messageId) => {
    let query = params.join(' ')
    if (messageId) bot.deleteMessage(chatId, messageId)
    if (query.length < 3) {
      const {message_id: innerMessageId} = await bot.say(chatId, 'What are you looking for?')
      query = await new Promise(resolve => {
        bot.once('message', (msg) => {
          bot.deleteMessage(chatId, msg.message_id)
          bot.deleteMessage(chatId, innerMessageId)
          resolve(msg.text)
        })
      })
    }
    const response = await searchManga(query.toLowerCase())
    if (response.error) return bot.say(chatId, response.error)

    const keyboard = bot.processButtons(
      response.results.map(([id, title]) => ({
        text: title,
        callback_data: `/manga ${id}`
      }))
    )
    if (!keyboard.inline_keyboard.length) return bot.say(chatId, 'No results found')
    bot.sendMessage(
      chatId,
      [
        'Found this, choose one:',
        'If too many results, try a more specific search'
      ].join('\n'),
      { reply_markup: keyboard, parse_mode: 'Markdown' }
    )
  },
  '/manga': async ([id, _page = 1], chatId, messageId) => {
    const { data, error } = await mangaData(id)
    if (error) return bot.say(chatId, error)
    const page = ~~_page
    const pageSize = 7
    const startPage = Math.max(0, page - 1)
    const start = pageSize * startPage
    const buttons = data.chapters.map(({ title, guid }) => {
      const text = title
        .replace(`${data.title}`, '')
        .replace('Chapter', '')
        .trim()
      return {
        text: text,
        callback_data: `/chapter ${guid}`
      }
    }).slice(start, start + pageSize)
    buttons.push(
      {
        text: 'Jump to page',
        callback_data: `/pageOf ${id}`
      },
      {
        text: 'Add to list',
        callback_data: `/add2List ${id}`
      }
    )
    bot.upsertMessage(chatId, `Chapters for *${data.title}*: Page ${page}`, buttons, messageId)
  },
  '/pageOf': async ([manga], chatId) => {
    bot.say(chatId, 'Jump to what page?')
    const page = await new Promise(resolve => {
      bot.once('message', (msg) => {
        resolve(msg.text)
      })
    })
    return actions['/manga']([manga, page], chatId)
  },
  '/chapter': async ([guid], chatId, messageId) => {
    const [manga, season, _chapter] = guid.split('/')
    const chapter = _chapter ? _chapter : season
    const buttons = [
      {
        text: 'Read Chapter',
        url: `https://7899-149-19-169-47.ngrok-free.app/read/${manga}/${chapter}/${season}`
      },
      {
        text: 'Done reading',
        callback_data: `/done ${manga}/${chapter}/${season}`
      }
    ]
    bot.upsertMessage(chatId, `${manga} ${chapter}`, buttons, messageId)
  }
}

export default (_bot) => {
  bot = _bot
  const userActions = registerUserActions(bot)
  bot.actions = {...actions, ...userActions}
}
