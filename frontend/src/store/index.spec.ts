import store from './index'

describe('checkout store', () => {
  it('uses the local API URL by default', () => {
    expect(store.state.apiUrl).toBe('http://localhost:3000')
  })
})
