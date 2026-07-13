import client from './client'

export const login = (identifier, password) =>
  client.post('/auth/login.php', { identifier, password }).then((r) => r.data)

export const setPassword = (userId, password) =>
  client.post('/auth/set-password.php', { user_id: userId, password }).then((r) => r.data)

export const logout = (refreshToken) =>
  client.post('/auth/logout.php', { refreshToken }).then((r) => r.data)

export const setLanguage = (language) =>
  client.post('/auth/set-language.php', { language }).then((r) => r.data)
