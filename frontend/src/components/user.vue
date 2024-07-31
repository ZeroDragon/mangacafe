<template lang="pug">
.userSection
  .error(v-if="errorMessage") {{errorMessage}}
  input(v-model="username", placeholder="Username")
  input(v-model="password", placeholder="Password" type="password")
  template(v-if="register")
    input(v-model="phone", placeholder="Phone number" type="phone")
  .buttons
    span.button(@click="submit") {{register ? 'Register' : 'Login'}}
    span(@click="toggleRegister") {{register ? 'I already have an account' : 'Need an account?'}}
  details(v-if="register")
    summary Important notice for lost passwords
    div We will only use your phone to send you a code to reset your password using <span class="important">TELEGRAM</span>. And we don't validate it in any way. If you enter a wrong number, you won't be able to reset your password in case you forget it.
  a(v-else href="https://t.me/mangacafebot?start=/forgottenpassword") Click here to reset your password.
</template>
<style lang="stylus" scoped>
span
  font-size 14px
  color var(--foreground)
input
  display block
  width 100%
  font-size 14px
  padding: 4px 10px
  outline none
  border 1px solid rgba(255, 255, 255, 0.1)
  background-color transparent
  border-radius: 20px
  color var(--foreground)
  margin-bottom 5px
.buttons
  display flex
  justify-content space-between
  span
    border 1px transparent
    &.button
      border 1px solid rgba(255, 255, 255, 0.1)
      &:hover
        background-color rgba(255, 255, 255, 0.1)
    cursor pointer
    padding: 4px 10px
    border-radius: 20px
a
  text-align center
  display block
  font-size 14px
  margin-top 10px
.error
  color var(--danger)
  font-size 14px
  margin-bottom 10px
details
  margin-top 10px
  summary
    cursor pointer
    font-size 14px
    color var(--danger)
  div
    font-size 12px
    color var(--foreground)
    .important
      font-weight bold
      color var(--foreground)
      background-color var(--primary)
</style>
<script>
import axios from 'axios'
export default {
  data() {
    return {
      username: '',
      password: '',
      phone: '',
      register: false,
      errorMessage: ''
    }
  },
  methods: {
    async submit() {
      const option = this.register ? 'signup' : 'login'
      const response = await axios.post(`${__API__}/${option}`, {
        username: this.username,
        password: this.password,
        phone: this.phone
      })
      console.log(response.data)
      this.errorMessage = 'Invalid username or password'
    },
    toggleRegister() {
      this.register = !this.register
    },
  }
}
</script>
