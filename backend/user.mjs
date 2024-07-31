class SmallFish {
  constructor (ttl = 86.4e6) {
    this.memory = {}
    this.ttl = ttl
    this.timer = setInterval(() => {
      Object.keys(this.memory).forEach((key) => {
        if (this.memory[key].ttl) {
          if (Date.now() - this.memory[key].timestamp > this.memory[key].ttl) {
            delete this.memory[key]
          }
        }
      })
    }, 3e5)
  }

  set = (params) => {
    this.memory[params.key] = {}
    this.memory[params.key].timestamp = Date.now()
    this.memory[params.key].ttl = params.ttl || this.ttl
    if (Array.isArray(params.value)) return this.memory[params.key].value = params.value
    this.memory[params.key] = params.value
  }

  get = (key) => {
    return this.memory[key] || null
  }
}

const cache = new SmallFish()

const signup = async (username, password, phone) => {
  console.log(username, password, phone)
  return { success: true }
}

const login = async (username, password) => {
  console.log(username, password)
  return { success: true }
}

const update = async (username, data) => {

}

const changeUsername = async (username, newUsername) => {

}

export default {
  signup,
  login,
  update,
  changeUsername
}
