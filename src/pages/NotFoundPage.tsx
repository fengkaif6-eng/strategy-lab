import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <section className="empty-panel">
      <h1>页面不存在</h1>
      <p>请检查链接地址，或返回首页继续浏览。</p>
      <Link to="/" className="btn btn-primary">
        返回首页
      </Link>
    </section>
  )
}
