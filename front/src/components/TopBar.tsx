import { API_URL } from '../config'
import { useAuthStore } from '../store/authStore'
import { useCartStore } from '../store/cartStore'
import './TopBar.css'

export default function TopBar() {
  const items = useCartStore((state) => state.items)
  const user = useAuthStore((state) => state.user)
  const clearUser = useAuthStore((state) => state.clearUser)

  const cartItems = items.reduce(
    (total, item) => total + item.quantity,
    0,
  )

  const handleLogout = async () => {
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    })
    clearUser()
    window.location.href = '/'
  }
  const isAdmin = user && (user.rol === 'ADMIN')
  return (
    <header className="topbar">
      <div className="topbar__content">
        <a href="/" className="topbar__logo">
          Ceti-Verso
        </a>

        <nav className="topbar__nav">
          <img src="https://i.pinimg.com/originals/ca/59/c7/ca59c7300ea299fc9f429da8e7924e5c.gif" style={{ width: '100%', maxWidth: '100px' }} />
          <img src="https://i.pinimg.com/originals/9d/d1/a0/9dd1a0c90caa865e3718947e2b91d35e.gif" style={{ width: '100%', maxWidth: '100px' }} />
          <img src="https://i.pinimg.com/originals/18/c7/60/18c76007a39d80d2329023124cd45c9a.gif" style={{ height: '99px', maxHeight: '100%', width: '100%', maxWidth: '100px' }} />
          <img src="https://i.pinimg.com/originals/e6/10/9e/e6109e32a9ac1a8f2496d7fba78e9c84.gif" style={{ width: '100%', maxWidth: '100px' }} />
          <img src="https://media.tenor.com/uUNcnHwYJQEAAAAj/running-pikachu-transparent-snivee.gif" style={{ width: '100%', maxWidth: '100px' }} />
        </nav>

        <div className="topbar__actions">
          {user ? (
            <>
              <button className="topbar__logout" onClick={handleLogout}>
                Cerrar sesión
              </button>
            </>
          ) : (
            <a href="/login" className="topbar__login">
              Iniciar sesión
            </a>
          )}
          <a href="/cart" className="topbar__cart">
            CARRITO
            <span>({cartItems})</span>
          </a>
          {isAdmin && (
            <a href="/admin/dashboard" className="topbar__AD" title="Panel de Administración">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M12 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 12c-5.33 0-16 2.67-16 8v2h32v-2c0-5.33-10.67-8-16-8z" />
              </svg>
            </a>
          )}
          {user && (
            <>
              <a href='/orders-history' className="topbar__history">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="30" fill="currentColor">
                  <path d="M12 4a8 8 0 1 0 7.35 4.86.8.8 0 1 1 1.48-.62A9.6 9.6 0 1 1 12 2.4c2.5 0 4.8 0.95 6.55 2.53V3.2a.8.8 0 0 1 1.6 0v4a.8.8 0 0 1-.8.8h-4a.8.8 0 0 1 0-1.6h2.23A7.97 7.97 0 0 0 12 4z" />
                  <path d="M12 7a.8.8 0 0 1 .8.8v4.25l2.83 2.83a.8.8 0 0 1-1.13 1.13l-3.1-3.1A.8.8 0 0 1 11.2 12V7.8A.8.8 0 0 1 12 7z" />
                </svg>
              </a>
            </>
          )}

        </div>
      </div>
    </header>
  )
}
