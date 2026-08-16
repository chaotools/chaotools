import { Link } from 'react-router-dom';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="footer" role="contentinfo">
      <div className="container footer__inner">
        <div className="footer__brand">
          <Link to="/" className="footer__logo">
            <img className="footer__logo-icon" src="/ct-icon.png" alt="" aria-hidden="true" />
            <span>Chaotools</span>
          </Link>
          <p className="footer__tagline">开发、媒体和日常小工具，打开即用。</p>
        </div>

        <nav className="footer__links" aria-label="页脚导航">
          <div className="footer__col">
            <h3 className="footer__col-title">导航</h3>
            <Link to="/" className="footer__link">首页</Link>
            <Link to="/explore" className="footer__link">探索工具</Link>
            <Link to="/my-tools" className="footer__link">我的工具</Link>
          </div>
          <div className="footer__col">
            <h3 className="footer__col-title">分类</h3>
            <Link to="/explore?category=dev" className="footer__link">开发工具</Link>
            <Link to="/explore?category=ai" className="footer__link">AI 大模型</Link>
            <Link to="/explore?category=fun" className="footer__link">趣味工具</Link>
          </div>
          <div className="footer__col">
            <h3 className="footer__col-title">关于</h3>
            <a
              href="https://github.com/chaotools/chaotools"
              target="_blank"
              rel="noopener noreferrer"
              className="footer__link"
            >
              GitHub
            </a>
            <Link to="/explore" className="footer__link">全部工具</Link>
          </div>
        </nav>
      </div>

      <div className="footer__bottom">
        <div className="container footer__bottom-inner">
          <span className="footer__copyright">
            &copy; {currentYear} Chaotools. MIT License.
          </span>
        </div>
      </div>
    </footer>
  );
}
