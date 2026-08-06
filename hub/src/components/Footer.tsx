import { Link } from 'react-router-dom';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="footer" role="contentinfo">
      <div className="container footer__inner">
        {/* Brand */}
        <div className="footer__brand">
          <Link to="/" className="footer__logo">
            <img src="/ct-icon.png" alt="CT" style={{ width: 18, height: 18, verticalAlign: 'middle', borderRadius: 4, marginRight: 6 }} />Chaotools
          </Link>
          <p className="footer__tagline">你的工具，你做主</p>
        </div>

        {/* Links */}
        <div className="footer__links">
          <div className="footer__col">
            <h4 className="footer__col-title">导航</h4>
            <Link to="/" className="footer__link">首页</Link>
            <Link to="/explore" className="footer__link">探索工具</Link>
            <Link to="/my-tools" className="footer__link">我的工具</Link>
          </div>
          <div className="footer__col">
            <h4 className="footer__col-title">分类</h4>
            <Link to="/explore?category=dev" className="footer__link">💻 开发工具</Link>
            <Link to="/explore?category=ai" className="footer__link">🤖 AI 大模型</Link>
            <Link to="/explore?category=fun" className="footer__link">🎮 趣味工具</Link>
          </div>
          <div className="footer__col">
            <h4 className="footer__col-title">关于</h4>
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
        </div>
      </div>

      {/* Bottom */}
      <div className="footer__bottom">
        <div className="container footer__bottom-inner">
          <span className="footer__copyright">
            &copy; {currentYear} Chaotools. MIT License.
          </span>
          <span className="footer__love">
            Made with ❤️ for developers
          </span>
        </div>
      </div>

      <style>{`
        .footer {
          margin-top: auto;
          background: var(--color-surface);
          border-top: 1px solid var(--color-border);
        }

        .footer__inner {
          display: grid;
          grid-template-columns: 1fr 2fr;
          gap: var(--space-12);
          padding-top: var(--space-16);
          padding-bottom: var(--space-12);
        }

        .footer__logo {
          font-size: var(--font-size-xl);
          font-weight: 800;
          color: var(--color-text);
          text-decoration: none;
          margin-bottom: var(--space-2);
          display: inline-block;
        }

        .footer__tagline {
          color: var(--color-text-secondary);
          font-size: var(--font-size-sm);
          margin: 0;
        }

        .footer__links {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: var(--space-8);
        }

        .footer__col-title {
          font-size: var(--font-size-sm);
          font-weight: 700;
          color: var(--color-text);
          margin-bottom: var(--space-4);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .footer__link {
          display: block;
          padding: var(--space-1) 0;
          font-size: var(--font-size-sm);
          color: var(--color-text-secondary);
          text-decoration: none;
          transition: color var(--transition-fast);
        }

        .footer__link:hover {
          color: var(--color-primary);
        }

        .footer__bottom {
          border-top: 1px solid var(--color-border-light);
        }

        .footer__bottom-inner {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: var(--space-6);
          padding-bottom: var(--space-6);
          font-size: var(--font-size-xs);
          color: var(--color-text-muted);
        }

        .footer__love {
          opacity: 0.7;
        }

        @media (max-width: 768px) {
          .footer__inner {
            grid-template-columns: 1fr;
            gap: var(--space-8);
            padding-top: var(--space-10);
            padding-bottom: var(--space-8);
          }

          .footer__links {
            grid-template-columns: repeat(2, 1fr);
            gap: var(--space-6);
          }

          .footer__bottom-inner {
            flex-direction: column;
            gap: var(--space-2);
            text-align: center;
          }
        }

        @media (max-width: 480px) {
          .footer__links {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </footer>
  );
}