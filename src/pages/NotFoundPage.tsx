import { Link } from 'react-router-dom'
import { useLocale } from '../context/LocaleContext'

export function NotFoundPage() {
  const { t } = useLocale()

  return (
    <section className="empty-panel">
      <h1>{t('页面不存在', 'Page Not Found')}</h1>
      <p>
        {t(
          '请检查链接地址，或返回首页继续浏览。',
          'Please check the URL or return to the home page.',
        )}
      </p>
      <Link to="/" className="btn btn-primary">
        {t('返回首页', 'Back to Home')}
      </Link>
    </section>
  )
}

