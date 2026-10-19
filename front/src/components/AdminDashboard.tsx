import { useEffect, useState } from 'react'
import { API_URL } from '../config'
import '../styles/AdminDashboard.css'

interface Producto {
  id: number
  nombre: string
  precio: number
  stock: number
  imagen?: string
  categoria_id?: number
}

interface Categoria {
  id: number
  nombre: string
}

export default function AdminDashboard() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<any>(null)

  const [form, setForm] = useState({ nombre: '', precio: '', stock: '', imagen: '', categoria_id: '1' })
  const [editingId, setEditingId] = useState<number | null>(null)

  useEffect(() => {
    const verifyAuthAndFetch = async () => {
      try {
        const resMe = await fetch(`${API_URL}/auth/me`, { credentials: 'include' })
        if (!resMe.ok) {
          window.location.href = '/login'
          return
        }
        const userData = await resMe.json()
        
        if (userData.rol !== 'ADMIN') {
          window.location.href = '/'
          return
        }

        setUser(userData)
        await fetchData()
      } catch (err: any) {
        window.location.href = '/login'
      }
    }

    verifyAuthAndFetch()
  }, [])

  const fetchData = async () => {
    try {
      const resProd = await fetch(`${API_URL}/productos`, { credentials: 'include' })
      if (!resProd.ok) throw new Error('Error al cargar productos')
      const dataProd = await resProd.json()
      setProductos(dataProd)

      const resCat = await fetch(`${API_URL}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          query: `
            query {
              categorias {
                id
                nombre
              }
            }
          `,
        }),
      })

      const jsonCat = await resCat.json()
      if (jsonCat.errors) throw new Error('Error al cargar categorías')
      
      setCategorias(jsonCat.data.categorias)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const url = editingId 
      ? `${API_URL}/productos/${editingId}` 
      : `${API_URL}/productos`
    const method = editingId ? 'PUT' : 'POST'

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          nombre: form.nombre,
          precio: parseFloat(form.precio),
          stock: parseInt(form.stock),
          imagen: form.imagen || null,
          categoria_id: parseInt(form.categoria_id),
        }),
      })

      if (!res.ok) throw new Error('Error al guardar el producto')

      setForm({ nombre: '', precio: '', stock: '', imagen: '', categoria_id: '1' })
      setEditingId(null)
      fetchData()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Estás seguro de eliminar este producto?')) return

    try {
      const res = await fetch(`${API_URL}/productos/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error('No se pudo eliminar')
      fetchData()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleEdit = (prod: Producto) => {
    setEditingId(prod.id)
    setForm({
      nombre: prod.nombre,
      precio: prod.precio.toString(),
      stock: prod.stock.toString(),
      imagen: prod.imagen || '',
      categoria_id: prod.categoria_id?.toString() || '1',
    })
  }

  if (loading) return <div className="admin-loading">Cargando panel de administración...</div>

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div>
          <h2 id='title'>Panel de Administrador {user ? `- ${user.nombre}` : ''}</h2>
        </div>
        <a href="/" className="admin-header__back">Volver a la tienda</a>
      </header>
      {error && <div className="admin-error">{error}</div>}

      <div className="admin-grid">
        <section className="admin-card">
          <h3>{editingId ? 'Editar Producto' : 'Agregar Nuevo Producto'}</h3>
          <form onSubmit={handleSubmit} className="admin-form">
            <div className="admin-form__field">
              <label>Nombre</label>
              <input
                type="text"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                required
                placeholder="Ej. Pin de chems"
              />
            </div>
            <div className="admin-form__field">
              <label>Precio ($)</label>
              <input
                type="number"
                step="0.01"
                value={form.precio}
                onChange={(e) => setForm({ ...form, precio: e.target.value })}
                required
                placeholder="0.00"
              />
            </div>
            <div className="admin-form__field">
              <label>Stock</label>
              <input
                type="number"
                value={form.stock}
                onChange={(e) => setForm({ ...form, stock: e.target.value })}
                required
                placeholder="0"
              />
            </div>
            <div className="admin-form__field">
              <label>URL de Imagen</label>
              <input
                type="text"
                value={form.imagen}
                onChange={(e) => setForm({ ...form, imagen: e.target.value })}
                placeholder="https://..."
              />
            </div>
            
            <div className="admin-form__field">
              <label>Categoría</label>
              <select
                value={form.categoria_id}
                onChange={(e) => setForm({ ...form, categoria_id: e.target.value })}
                required
              >
                {categorias.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.id} - {cat.nombre}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="admin-form__actions">
              <button type="submit" className="admin-form__submit">
                {editingId ? 'Actualizar Producto' : 'Crear Producto'}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(null)
                    setForm({ nombre: '', precio: '', stock: '', imagen: '', categoria_id: '1' })
                  }}
                  className="admin-form__cancel"
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="admin-card admin-table-container">
          <h3>Inventario de Productos</h3>
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>Precio</th>
                <th>Stock</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {productos.map((prod) => (
                <tr key={prod.id}>
                  <td>{prod.id}</td>
                  <td className="font-medium">{prod.nombre}</td>
                  <td>${prod.precio}</td>
                  <td>{prod.stock}</td>
                  <td className="admin-actions">
                    <button onClick={() => handleEdit(prod)} className="btn-edit">
                      Editar
                    </button>
                    <button onClick={() => handleDelete(prod.id)} className="btn-delete">
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
              {productos.length === 0 && (
                <tr>
                  <td colSpan={5} className="admin-empty">
                    No hay productos registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  )
}