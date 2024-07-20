import search from './search.mjs'
let bot = null

const lists = {}

const getUserLists = async (userId) => {
  if (lists[userId]) return await lists[userId]
  lists[userId] = {}
  return await lists[userId]
}

const actions = {
  '/myLists': async (params, chatId, messageId, userId) => {
    const userLists = await getUserLists(userId)
    let buttons = [
      {
        text: 'Create a list',
        callback_data: '/createList'
      }
    ]
    if (Object.keys(userLists).length === 0)
      return bot.upsertMessage(chatId, 'You have no lists, want to create one?', buttons, messageId)
    buttons = [...Object.keys(userLists).map(name => {
      return {
        text: name,
        callback_data: `/list ${name}`
      }
    }), ...buttons]
    bot.upsertMessage(chatId, 'Here are your lists', buttons, messageId)
  },
  '/createList': async ([mangaUid], chatId, messageId, userId) => {
    const { message_id: innerMessageId } = await bot.say(chatId, 'Name your list')
    const name = await new Promise(resolve => {
      bot.once('message', (msg) => {
        bot.deleteMessage(chatId, msg.message_id)
        bot.deleteMessage(chatId, innerMessageId)
        resolve(msg.text)
      })
    })
    let buttons = [{
      text: 'Add to list',
      callback_data: `/add2List ${mangaUid} ${name}`
    }]
    if (!mangaUid) {
      buttons = [{
        text: 'My lists',
        callback_data: '/myLists'
      }]
    }
    const userLists = await getUserLists(userId)
    userLists[name] = []
    bot.upsertMessage(chatId, `List ${name} created`, buttons, messageId, true)
  },
  '/done': async ([guid], chatId, messageId) => {
    const [manga, chapter, season] = guid.split('/')
    console.log(manga, chapter, season)
    bot.actions['/manga']([manga], chatId, messageId)
  },
  '/add2List': async ([guid, ...paramListName], chatId, messageId, userId) => {
    const userLists = await getUserLists(userId)
    if (Object.keys(userLists).length === 0) {
      const buttons = [{
        text: 'Create a new list',
        callback_data: `/createList ${guid}`
      }]
      return bot.upsertMessage(chatId, 'You have no lists, want to create one?', buttons, messageId)
    }
    if (paramListName.length !== 0) {
      const listName = paramListName.join(' ')
      const {results: [manga]} = await search(guid.toLowerCase())
      userLists[listName].push({ guid, name: manga[1] })
      const buttons = [{
        text: 'My lists',
        callback_data: `/myLists`
      }]
      return bot.upsertMessage(chatId, `Added to list ${listName}`, buttons, messageId)
    }
    const buttons = Object.keys(userLists).map(name => {
      return {
        text: name,
        callback_data: `/add2List ${guid} ${name}`
      }
    })
    return bot.upsertMessage(chatId, `Select a list to add it`, buttons, messageId)
  },
  '/list': async (paramName, chatId, messageId, userId) => {
    const name = paramName.join(' ')
    const buttons = [
      {
        text: 'Delete list',
        callback_data: `/deleteList ${name}`
      },
      {
        text: 'Rename list',
        callback_data: `/renameList ${name}`
      },
      {
        text: 'List items',
        callback_data: `/listItems ${name}`
      },
      {
        text: 'Remove item from list',
        callback_data: `/removeFrom ${name}`
      },
      {
        text: 'My lists',
        callback_data: '/myLists'
      }
    ]
    bot.upsertMessage(chatId, `List ${name}`, buttons, messageId, true)
  },
  '/deleteList': async (paramName, chatId, messageId, userId) => {
    const name = paramName.join(' ')
    const userLists = await getUserLists(userId)
    const { message_id: innerMessageId } = await bot.say(chatId, 'To delete this list, type the name of the list')
    const confirmation = await new Promise(resolve => {
      bot.once('message', (msg) => {
        bot.deleteMessage(chatId, msg.message_id)
        bot.deleteMessage(chatId, innerMessageId)
        resolve(msg.text)
      })
    })
    if (confirmation !== name) return bot.say(chatId, 'List name does not match')
    delete userLists[name]
    const buttons = [{
      text: 'My lists',
      callback_data: '/myLists'
    }]
    bot.upsertMessage(chatId, `List ${name} deleted`, buttons, messageId, true)
  },
  '/renameList': async (paramName, chatId, messageId, userId) => {
    const name = paramName.join(' ')
    const userLists = await getUserLists(userId)
    const { message_id: innerMessageId } = await bot.say(chatId, 'To rename this list, type the new name of the list')
    const newName = await new Promise(resolve => {
      bot.once('message', (msg) => {
        bot.deleteMessage(chatId, msg.message_id)
        bot.deleteMessage(chatId, innerMessageId)
        resolve(msg.text)
      })
    })
    userLists[newName] = userLists[name]
    delete userLists[name]
    const buttons = [{
      text: 'My lists',
      callback_data: '/myLists'
    }]
    bot.upsertMessage(chatId, `List ${name} renamed to ${newName}`, buttons, messageId, true)
  },
  '/listItems': async ([...params], chatId, messageId, userId) => {
    const userLists = await getUserLists(userId)
    const name = params.join(' ')
    const buttons = userLists[name].map(({ guid, name }) => {
      return {
        text: name,
        callback_data: `/manga ${guid}`
      }
    })
    buttons.push({
      text: 'Return to list',
      callback_data: `/list ${name}`
    })
    bot.upsertMessage(chatId, `List ${name}`, buttons, messageId, true)
  },
  '/removeFrom': async (paramName, chatId, messageId, userId) => {
    const listName = paramName.join(' ')
    const userLists = await getUserLists(userId)
    const list = userLists[listName]

    const buttons = list.map(({guid, name}) => {
      return {
        text: name,
        callback_data: `/removeMangaFrom ${guid} ${listName}`
      }
    })
    return bot.upsertMessage(chatId, `Select an item to remove it from list`, buttons, messageId)
  },
  '/removeMangaFrom': async ([mangaGuid, ...paramListName], chatId, messageId, userId) => {
    const listName = paramListName.join(' ')
    const userLists = await getUserLists(userId)
    userLists[listName] = userLists[listName].filter(({ guid }) => {
      return guid !== mangaGuid
    })
    const buttons = [{
      text: 'Return',
      callback_data: `/list ${listName}`
    }]
    return bot.upsertMessage(chatId, `Item deleted from list`, buttons, messageId, true)
  }
}

export default (_bot) => {
  bot = _bot
  return actions
}
