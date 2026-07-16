/*
 * Renders the Lecture Notes pages from the static data file /data/lectures.json.
 *
 * To publish a new file: drop the PDF/slide into the matching
 * lectures/<course>/<week>/ folder, then add an entry for it in
 * /data/lectures.json (under the right course + section). No build step needed —
 * reload the page and it appears.
 *
 * - A page with <div id="lectures-index"></div> gets the course cards.
 * - A page with <div id="lecture-course" data-course="FE"></div> gets that
 *   course's hero, feature links, top files, and session tables.
 */
(() => {
  const esc = (v) =>
    String(v ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');

  const indexMount = document.getElementById('lectures-index');
  const courseMount = document.getElementById('lecture-course');
  if (!indexMount && !courseMount) return;

  fetch('/data/lectures.json')
    .then((r) => r.json())
    .then((data) => {
      const courses = data.courses || [];
      if (indexMount) renderIndex(indexMount, courses);
      if (courseMount) {
        const course = courses.find((c) => c.id === courseMount.getAttribute('data-course'));
        if (course) renderCourse(courseMount, course);
      }
      // Re-run reveal on any freshly added .reveal elements.
      document.querySelectorAll('.reveal:not(.in)').forEach((el) => el.classList.add('in'));
    })
    .catch((err) => {
      const mount = indexMount || courseMount;
      if (mount) mount.innerHTML = '<p class="note">Could not load lecture data.</p>';
      console.error('lectures.js:', err);
    });

  function renderIndex(mount, courses) {
    mount.className = 'card-grid';
    mount.innerHTML = courses
      .map(
        (c) => `
        <a class="card" href="${esc(c.href)}/">
          <span class="card-kicker">${esc(c.code)} · ${esc(c.level)}</span>
          <h3>${esc(c.title)}</h3>
          <p>${esc(c.blurb)}</p>
          <span class="card-foot">Slides · problem sets →</span>
        </a>`
      )
      .join('');
  }

  function renderCourse(mount, course) {
    const links = (course.links || [])
      .map(
        (link) => `
        <a class="feature" href="${esc(link.href)}">
          <span class="feature-label">${esc(link.label)} →</span>
          ${link.note ? `<span class="feature-note">${esc(link.note)}</span>` : ''}
        </a>`
      )
      .join('');

    const top = (course.top || [])
      .map((f) => `<p><a href="${esc(f.href)}">${esc(f.label)} (${esc(f.kind)}) →</a></p>`)
      .join('');

    const sections = (course.sections || [])
      .map(
        (section) => `
        <h2>${esc(section.title)}</h2>
        ${section.note ? `<p>${esc(section.note)}</p>` : ''}
        <table class="toc">
          <thead>
            <tr><th>Session</th><th>Topic</th><th>Materials</th></tr>
          </thead>
          <tbody>
            ${section.items
              .map(
                (item) => `
              <tr>
                <td class="toc-day">${esc(item.label)}</td>
                <td>${item.title ? `<strong>${esc(item.title)}</strong>` : ''}${
                  item.title && item.summary ? '<br />' : ''
                }${item.summary ? esc(item.summary) : ''}</td>
                <td class="toc-links">${item.files
                  .map((f) => `<a href="${esc(f.href)}">${esc(f.label)} (${esc(f.kind)})</a>`)
                  .join('<br />')}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>`
      )
      .join('');

    mount.innerHTML = `
      <section class="page-hero">
        <div class="container">
          <p class="eyebrow">${esc(course.eyebrow)}</p>
          <h1>${esc(course.title)}</h1>
          <p>${esc(course.intro)}</p>
        </div>
      </section>
      <section class="section" style="padding-top: 1.5rem;">
        <div class="container">
          ${links}
          <article class="prose">
            ${top}
            ${sections}
          </article>
          <p style="margin-top: 2.5rem;"><a class="backlink" href="/lectures/">← All lecture notes</a></p>
        </div>
      </section>`;
  }
})();
