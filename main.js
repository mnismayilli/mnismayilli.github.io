/*
 * Shared site behaviour for the plain-HTML site.
 * - Injects the shared header (nav) and footer into every page, so they live
 *   in ONE place. To change a nav link or footer entry, edit the arrays below.
 * - Handles the sticky-header scroll state, the mobile menu toggle, and the
 *   scroll-reveal animation.
 *
 * Every page just needs a <main id="main"> … </main>; the nav and footer are
 * added around it automatically.
 */
(() => {
  const SITE_TITLE = 'Mehman Ismayilli';

  // Primary navigation — also reused as the footer "Site" column.
  const NAV_LINKS = [
    { text: 'Research', href: '/projects/' },
    { text: 'Teaching', href: '/teaching/' },
    { text: 'Lecture Notes', href: '/lectures/' },
    { text: 'M&amp;A Watch', href: '/ma-watch/' },
  ];

  const PROFILE_LINKS = [
    { text: 'CV', href: '/about/' },
    { text: 'Contact', href: '/contact/' },
    { text: 'Oxford', href: 'https://www.economics.ox.ac.uk/people/mehman-ismayilli', ext: true },
  ];

  const ELSEWHERE_LINKS = [
    { text: 'LinkedIn', href: 'https://www.linkedin.com/in/mismayilli/', ext: true },
    { text: 'X/Twitter', href: 'https://x.com/IsmayilliMehman', ext: true },
    { text: 'Network of Industrial Economists', href: 'https://ind-econ.github.io', ext: true },
  ];

  // Normalise a path for "current page" comparison (ignore trailing slash).
  const path = location.pathname.replace(/\/index\.html$/, '/');
  const isCurrent = (href) => {
    const h = href.replace(/\/$/, '');
    if (h === '') return path === '/' || path === '';
    return path === h || path === h + '/' || path.startsWith(h + '/');
  };

  const navLinksHtml = NAV_LINKS.map(
    (l) => `<li><a href="${l.href}"${isCurrent(l.href) ? ' aria-current="page"' : ''}>${l.text}</a></li>`
  ).join('');

  const headerHtml = `
    <header class="site-header" id="site-header">
      <div class="container nav">
        <a class="brand brand--home" href="/" aria-label="Home">
          <span class="brand-dot"></span><span class="brand-name">Home</span>
        </a>
        <nav aria-label="Primary">
          <ul class="nav-links" id="nav-links">${navLinksHtml}</ul>
        </nav>
        <button class="nav-toggle" id="nav-toggle" aria-expanded="false" aria-controls="nav-links" aria-label="Menu">
          <span></span><span></span><span></span>
        </button>
      </div>
    </header>`;

  const ext = (l) => (l.ext ? ' rel="noopener"' : '');
  const footerHtml = `
    <footer class="site-footer">
      <div class="container">
        <div class="footer-grid">
          <div class="footer-brand">
            <span class="brand"><span class="brand-dot"></span>${SITE_TITLE}</span>
            <p>Lecturer in Economics, University of Oxford.</p>
          </div>
          <div class="footer-links">
            <div class="footer-col">
              <h4>Site</h4>
              ${NAV_LINKS.map((l) => `<a href="${l.href}">${l.text}</a>`).join('')}
            </div>
            <div class="footer-col">
              <h4>Profile</h4>
              ${PROFILE_LINKS.map((l) => `<a href="${l.href}"${ext(l)}>${l.text}</a>`).join('')}
            </div>
            <div class="footer-col">
              <h4>Elsewhere</h4>
              ${ELSEWHERE_LINKS.map((l) => `<a href="${l.href}"${ext(l)}>${l.text}</a>`).join('')}
            </div>
          </div>
        </div>
        <div class="footer-base">
          <span>&copy; ${new Date().getFullYear()} ${SITE_TITLE}</span>
          <span>Oxford, UK</span>
        </div>
      </div>
    </footer>`;

  // Inject header before, and footer after, the page's <main>.
  document.body.insertAdjacentHTML('afterbegin', headerHtml);
  document.body.insertAdjacentHTML('beforeend', footerHtml);

  // Sticky header scroll state.
  const header = document.getElementById('site-header');
  const onScroll = () => header && header.setAttribute('data-scrolled', String(window.scrollY > 8));
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // Mobile menu toggle.
  const toggle = document.getElementById('nav-toggle');
  const links = document.getElementById('nav-links');
  toggle &&
    toggle.addEventListener('click', () => {
      const open = links.getAttribute('data-open') === 'true';
      links.setAttribute('data-open', String(!open));
      toggle.setAttribute('aria-expanded', String(!open));
    });

  // Scroll-reveal.
  const items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window) || !items.length) {
    items.forEach((el) => el.classList.add('in'));
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.1 }
    );
    items.forEach((el) => io.observe(el));
  }
})();
