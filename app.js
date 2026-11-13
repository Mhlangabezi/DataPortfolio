/*
  Portfolio site script.

  Visitors: loads posts.json and shows the blog.
  Owner: after signing in with a GitHub access token, can add, edit and delete posts.
  Every change is saved to your GitHub repository as one commit (posts.json plus any
  pictures). GitHub decides who may write, so nobody else can change anything.
*/
(function () {
  'use strict';

  var TITLE = 'Mhlangabezi Mdwayi';
  var CFG_KEY = 'portfolio-owner-v1';
  var MAX_SIDE = 1600;
  var MAX_BYTES = 5 * 1024 * 1024;
  var API = 'https://api.github.com';

  function $(id) { return document.getElementById(id); }
  var home = $('home'), reader = $('reader'), composerView = $('composerView'), ownerView = $('ownerView');
  var list = $('postList'), adminBar = $('adminBar'), loadNote = $('loadNote');

  var posts = [];
  var loaded = false;
  var cfg = null;              // { repo, token, branch } once signed in
  var busy = false;
  var notice = '';
  var pendingDelete = null;
  var localImages = {};        // path -> data URL, so new pictures show before GitHub Pages rebuilds
  var draft = null;
  var removedSrcs = [];

  /* ---------- small helpers ---------- */
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function fmt(d) {
    var p = String(d || '').split('-');
    var m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    if (p.length !== 3 || !m[parseInt(p[1], 10) - 1]) return String(d || '');
    return p[2] + ' ' + m[parseInt(p[1], 10) - 1] + ' ' + p[0];
  }
  function slugify(s) {
    var t = String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return t.slice(0, 50).replace(/-+$/, '');
  }
  function rand(n) { return Math.random().toString(36).slice(2, 2 + n).padEnd(n, '0'); }
  function find(id) {
    for (var i = 0; i < posts.length; i++) if (posts[i].id === id) return posts[i];
    return null;
  }
  function makeId(title, date) {
    var base = slugify(title) || ('update-' + date.replace(/-/g, ''));
    var id = base, n = 2;
    while (find(id)) { id = base + '-' + n; n += 1; }
    return id;
  }
  function safeUrl(u) {
    try {
      var x = new URL(String(u).trim());
      return (x.protocol === 'https:' || x.protocol === 'http:') ? x.href : null;
    } catch (e) { return null; }
  }
  function normUrl(u) {
    var t = String(u).trim();
    if (!t) return '';
    if (!/^[a-z][a-z0-9+.-]*:/i.test(t)) t = 'https://' + t;
    return safeUrl(t);
  }
  function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } }
  function safeSrc(s) { return /^images\/[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(String(s)); }
  function imgSrc(s) { return localImages[s] || s; }
  function titleOf(p) { return p.title || 'Update'; }

  function clean(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.filter(function (p) { return p && typeof p === 'object' && typeof p.id === 'string' && p.id; }).map(function (p) {
      return {
        id: String(p.id),
        date: String(p.date || ''),
        title: String(p.title || ''),
        body: String(p.body || ''),
        links: (Array.isArray(p.links) ? p.links : []).filter(function (l) { return l && safeUrl(l.url); })
          .map(function (l) { return { label: String(l.label || ''), url: safeUrl(l.url) }; }),
        images: (Array.isArray(p.images) ? p.images : []).filter(function (im) { return im && safeSrc(im.src); })
          .map(function (im) { return { src: String(im.src), alt: String(im.alt || ''), caption: String(im.caption || '') }; }),
        sample: p.sample === true
      };
    });
  }
  function serialize(arr) {
    var out = arr.map(function (p) {
      var o = { id: p.id, date: p.date, title: p.title, body: p.body, links: p.links, images: p.images };
      if (p.sample) o.sample = true;
      return o;
    });
    return JSON.stringify(out, null, 2) + '\n';
  }
  function setStatus(msg) {
    var all = document.querySelectorAll('.status-msg');
    for (var i = 0; i < all.length; i++) all[i].textContent = msg;
  }
  function say(msg) { notice = msg; setStatus(msg); }

  /* ---------- rendering post text ---------- */
  var INLINE = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|`([^`\n]+)`|(https?:\/\/[^\s<]+)/g;
  function extLink(url, label) {
    var a = el('a', 'ext', label);
    var s = safeUrl(url);
    if (s) { a.href = s; a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    return a;
  }
  function addInline(parent, text) {
    var last = 0, m;
    INLINE.lastIndex = 0;
    while ((m = INLINE.exec(text))) {
      if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
      if (m[1]) {
        parent.appendChild(extLink(m[2], m[1]));
      } else if (m[3]) {
        parent.appendChild(el('code', '', m[3]));
      } else {
        var url = m[4], tail = '';
        var t = /[.,;:!?)\]'"]+$/.exec(url);
        if (t) { tail = t[0]; url = url.slice(0, url.length - tail.length); }
        parent.appendChild(extLink(url, url));
        if (tail) parent.appendChild(document.createTextNode(tail));
      }
      last = INLINE.lastIndex;
    }
    if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
  }
  function renderBody(box, text) {
    var lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    var i = 0, para = [], items = [];
    function flushPara() {
      if (para.length) { var p = el('p'); addInline(p, para.join(' ')); box.appendChild(p); para = []; }
    }
    function flushList() {
      if (items.length) {
        var ul = el('ul');
        items.forEach(function (t) { var li = el('li'); addInline(li, t); ul.appendChild(li); });
        box.appendChild(ul);
        items = [];
      }
    }
    while (i < lines.length) {
      var line = lines[i];
      if (/^```/.test(line)) {
        flushPara(); flushList();
        var code = [];
        i += 1;
        while (i < lines.length && !/^```/.test(lines[i])) { code.push(lines[i]); i += 1; }
        box.appendChild(el('pre', '', code.join('\n')));
        i += 1;
        continue;
      }
      if (/^##\s+/.test(line)) { flushPara(); flushList(); box.appendChild(el('h3', '', line.replace(/^##\s+/, ''))); i += 1; continue; }
      if (/^\s*[-*]\s+/.test(line)) { flushPara(); items.push(line.replace(/^\s*[-*]\s+/, '')); i += 1; continue; }
      if (/^\s*$/.test(line)) { flushPara(); flushList(); i += 1; continue; }
      flushList();
      para.push(line.trim());
      i += 1;
    }
    flushPara(); flushList();
  }
  function excerpt(body) {
    var out = '', inCode = false;
    var lines = String(body || '').split('\n');
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (/^```/.test(l)) { inCode = !inCode; continue; }
      if (inCode || /^##\s+/.test(l) || /^\s*$/.test(l)) continue;
      out += (out ? ' ' : '') + l.replace(/^\s*[-*]\s+/, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/`/g, '').trim();
      if (out.length > 170) break;
    }
    if (out.length > 160) out = out.slice(0, 157).replace(/\s+\S*$/, '') + '...';
    return out;
  }

  /* ---------- GitHub access (owner only) ---------- */
  function headers(token, json) {
    var h = { 'Accept': 'application/vnd.github+json', 'Authorization': 'Bearer ' + token, 'X-GitHub-Api-Version': '2022-11-28' };
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }
  async function api(method, path, body) {
    var res = await fetch(API + path, { method: method, headers: headers(cfg.token, !!body), body: body ? JSON.stringify(body) : undefined });
    var text = await res.text();
    var data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
    if (!res.ok) {
      var err = new Error((data && data.message) || ('GitHub error ' + res.status));
      err.status = res.status;
      throw err;
    }
    return data;
  }
  async function readPosts(repo, ref) {
    var h = headers(cfg.token, false);
    h.Accept = 'application/vnd.github.raw+json';
    var res = await fetch(API + '/repos/' + repo + '/contents/posts.json?ref=' + encodeURIComponent(ref), { headers: h });
    if (res.status === 404) return [];
    if (!res.ok) { var e = new Error('GitHub error ' + res.status); e.status = res.status; throw e; }
    var text = await res.text();
    try { return clean(JSON.parse(text)); } catch (e2) {
      throw new Error('posts.json in your repository is not valid JSON. Fix it on GitHub, then try again.');
    }
  }
  async function listImages(repo, ref) {
    try {
      var r = await api('GET', '/repos/' + repo + '/contents/images?ref=' + encodeURIComponent(ref));
      var set = {};
      (Array.isArray(r) ? r : []).forEach(function (x) { set['images/' + x.name] = true; });
      return set;
    } catch (e) {
      if (e.status === 404) return {};
      throw e;
    }
  }
  /* Saves everything as ONE commit: new pictures, deleted pictures and posts.json.
     mutate(currentPosts) returns { posts, deletePaths } built from the latest copy on GitHub. */
  async function commit(message, mutate, newFiles) {
    var repo = cfg.repo, branch = cfg.branch;
    for (var attempt = 0; attempt < 2; attempt++) {
      var ref = await api('GET', '/repos/' + repo + '/git/ref/heads/' + encodeURI(branch));
      var headSha = ref.object.sha;
      var head = await api('GET', '/repos/' + repo + '/git/commits/' + headSha);
      var current = await readPosts(repo, headSha);
      var result = mutate(current);
      var existing = await listImages(repo, headSha);
      var entries = [];
      var pj = await api('POST', '/repos/' + repo + '/git/blobs', { content: serialize(result.posts), encoding: 'utf-8' });
      entries.push({ path: 'posts.json', mode: '100644', type: 'blob', sha: pj.sha });
      for (var i = 0; i < newFiles.length; i++) {
        var b = await api('POST', '/repos/' + repo + '/git/blobs', { content: newFiles[i].base64, encoding: 'base64' });
        entries.push({ path: newFiles[i].path, mode: '100644', type: 'blob', sha: b.sha });
      }
      (result.deletePaths || []).forEach(function (p) {
        if (existing[p]) entries.push({ path: p, mode: '100644', type: 'blob', sha: null });
      });
      var tree = await api('POST', '/repos/' + repo + '/git/trees', { base_tree: head.tree.sha, tree: entries });
      var nc = await api('POST', '/repos/' + repo + '/git/commits', { message: message, tree: tree.sha, parents: [headSha] });
      try {
        await api('PATCH', '/repos/' + repo + '/git/refs/heads/' + encodeURI(branch), { sha: nc.sha, force: false });
        return result.posts;
      } catch (e) {
        if (e.status === 422 && attempt === 0) continue;   // the branch moved while we worked: start again once
        throw e;
      }
    }
    throw new Error('The repository changed while publishing. Try again.');
  }
  function explain(err) {
    var s = err && err.status;
    if (s === 401) return 'GitHub did not accept the token. It may have expired. Sign in again from Owner sign-in.';
    if (s === 403 || s === 404) return 'The token cannot write to this repository. Check that it has Contents: Read and write access to it.';
    if (s === 409) return 'The repository has no files yet. Upload your site files first.';
    if (s === 422) return 'GitHub rejected the change. Try again in a moment.';
    if (err instanceof TypeError) return 'Could not reach GitHub. Check your connection and try again.';
    return (err && err.message) || 'Something went wrong. Try again.';
  }
  function loadCfg() {
    try {
      var s = localStorage.getItem(CFG_KEY);
      var o = s && JSON.parse(s);
      if (o && o.repo && o.token && o.branch) return o;
    } catch (e) {}
    return null;
  }
  function saveCfg() { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); return true; } catch (e) { return false; } }
  function clearCfg() { try { localStorage.removeItem(CFG_KEY); } catch (e) {} }

  async function refreshFromRepo() {
    if (!cfg) return;
    try {
      var ref = await api('GET', '/repos/' + cfg.repo + '/git/ref/heads/' + encodeURI(cfg.branch));
      posts = await readPosts(cfg.repo, ref.object.sha);
      loaded = true;
      loadNote.hidden = true;
      renderHome();
      var h = location.hash.slice(1);
      if (h.indexOf('post-') === 0) route(false);
    } catch (e) { /* keep the copy that GitHub Pages served */ }
  }

  /* ---------- pictures ---------- */
  function readAsDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(new Error('Could not read the picture.')); };
      r.readAsDataURL(blob);
    });
  }
  async function processImage(file) {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
      throw new Error(file.name + ' is not a JPEG, PNG, WebP or GIF picture.');
    }
    var type = file.type, blob = file;
    if (type !== 'image/gif') {
      var bmp = await createImageBitmap(file);
      var scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
      var w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      var ctx = c.getContext('2d');
      var out = type === 'image/png' ? 'image/png' : 'image/jpeg';
      if (out === 'image/jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); }
      ctx.drawImage(bmp, 0, 0, w, h);
      if (bmp.close) bmp.close();
      blob = await new Promise(function (resolve) { c.toBlob(resolve, out, 0.86); });
      type = out;
      if (!blob) throw new Error('Could not prepare ' + file.name + '.');
    }
    if (blob.size > MAX_BYTES) throw new Error(file.name + ' is still over 5 MB after resizing. Try a smaller picture.');
    var dataUrl = await readAsDataUrl(blob);
    return { dataUrl: dataUrl, base64: dataUrl.split(',')[1], ext: type === 'image/png' ? 'png' : (type === 'image/gif' ? 'gif' : 'jpg') };
  }

  /* ---------- home: owner bar and post list ---------- */
  function renderAdmin() {
    adminBar.textContent = '';
    if (!cfg) return;
    var bar = el('div', 'admin-bar');
    bar.appendChild(el('p', '', 'Owner mode. Posts you publish are saved to ' + cfg.repo + ' and appear on the public site about a minute later.'));
    var add = el('a', 'btn', 'New post');
    add.href = '#new-post';
    bar.appendChild(add);
    var s = el('span', 'status-msg');
    s.setAttribute('aria-live', 'polite');
    s.textContent = notice;
    bar.appendChild(s);
    adminBar.appendChild(bar);
  }
  function toolsFor(p) {
    var box = el('div', 'post-tools');
    var edit = el('a', 'mini', 'Edit');
    edit.href = '#edit-' + p.id;
    box.appendChild(edit);
    if (pendingDelete === p.id) {
      box.appendChild(el('span', 'ask', 'Delete this post for good?'));
      var yes = el('button', 'mini solid', 'Yes, delete');
      yes.type = 'button';
      yes.disabled = busy;
      yes.addEventListener('click', function () { deletePost(p); });
      var no = el('button', 'mini', 'Cancel');
      no.type = 'button';
      no.addEventListener('click', function () { pendingDelete = null; refreshViews(); });
      box.appendChild(yes);
      box.appendChild(no);
    } else {
      var del = el('button', 'mini danger', 'Delete');
      del.type = 'button';
      del.disabled = busy;
      del.addEventListener('click', function () { pendingDelete = p.id; refreshViews(); });
      box.appendChild(del);
    }
    return box;
  }
  function renderList() {
    list.textContent = '';
    if (!loaded) return;
    var sorted = posts.slice().sort(function (a, b) { return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0); });
    if (!sorted.length) {
      list.appendChild(el('p', 'empty', cfg ? 'No posts yet. Choose New post to write the first one.' : 'No posts yet. Check back soon.'));
      return;
    }
    sorted.forEach(function (p) {
      var item = el('div', 'post-item');
      var a = el('a', 'post-link');
      a.href = '#post-' + p.id;
      a.appendChild(el('span', 'date', fmt(p.date)));
      var mid = el('div');
      mid.appendChild(el('h3', '', titleOf(p)));
      var ex = excerpt(p.body);
      if (ex) mid.appendChild(el('p', 'ex', ex));
      a.appendChild(mid);
      var aside = el('div', 'aside');
      if (p.sample) aside.appendChild(el('span', 'tag', 'Sample'));
      if (p.images.length) {
        var th = el('img', 'thumb');
        th.src = imgSrc(p.images[0].src);
        th.alt = '';
        th.loading = 'lazy';
        aside.appendChild(th);
      }
      a.appendChild(aside);
      item.appendChild(a);
      if (cfg) item.appendChild(toolsFor(p));
      list.appendChild(item);
    });
  }
  function renderHome() { renderAdmin(); renderList(); }
  function refreshViews() {
    renderHome();
    var h = location.hash.slice(1);
    if (h.indexOf('post-') === 0 && !reader.hidden) { var p = find(h.slice(5)); if (p) showPost(p); }
  }

  /* ---------- reader ---------- */
  function showPost(p) {
    reader.textContent = '';
    var back = el('a', 'back', '← Back to all posts');
    back.href = '#blog';
    reader.appendChild(back);
    reader.appendChild(el('h1', '', titleOf(p)));
    var by = el('div', 'byline');
    by.appendChild(el('span', 'label', fmt(p.date)));
    if (p.sample) by.appendChild(el('span', 'tag', 'Sample'));
    reader.appendChild(by);
    if (cfg) {
      reader.appendChild(toolsFor(p));
      var s = el('span', 'status-msg');
      s.setAttribute('aria-live', 'polite');
      s.textContent = notice;
      reader.appendChild(s);
    }
    var body = el('div', 'body');
    renderBody(body, p.body);
    reader.appendChild(body);
    p.images.forEach(function (im) {
      var fig = el('figure', 'shot');
      var a = el('a');
      a.href = imgSrc(im.src);
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      var img = el('img');
      img.src = imgSrc(im.src);
      img.alt = im.alt || im.caption || '';
      img.loading = 'lazy';
      a.appendChild(img);
      fig.appendChild(a);
      if (im.caption) fig.appendChild(el('figcaption', '', im.caption));
      reader.appendChild(fig);
    });
    if (p.links.length) {
      var box = el('div', 'links');
      box.appendChild(el('span', 'label', 'Links'));
      var ul = el('ul');
      p.links.forEach(function (l) {
        var li = el('li');
        li.appendChild(extLink(l.url, l.label || hostOf(l.url)));
        ul.appendChild(li);
      });
      box.appendChild(ul);
      reader.appendChild(box);
    }
    document.title = titleOf(p) + ' | ' + TITLE;
    home.hidden = true; composerView.hidden = true; ownerView.hidden = true;
    reader.hidden = false;
  }

  /* ---------- composer ---------- */
  function input(type) { var i = el('input', 'in'); i.type = type; return i; }
  function field(id, labelText, control, hint) {
    var wrap = el('div', 'field');
    var l = el('label', '', labelText);
    l.setAttribute('for', id);
    control.id = id;
    wrap.appendChild(l);
    wrap.appendChild(control);
    if (hint) wrap.appendChild(el('p', 'hint', hint));
    return wrap;
  }
  function showComposer(existing) {
    removedSrcs = [];
    draft = existing ? {
      id: existing.id, date: existing.date, title: existing.title, body: existing.body,
      links: existing.links.map(function (l) { return { label: l.label, url: l.url }; }),
      images: existing.images.map(function (im) { return { existing: true, src: im.src, alt: im.alt, caption: im.caption }; })
    } : { id: null, date: today(), title: '', body: '', links: [], images: [] };

    composerView.textContent = '';
    var back = el('a', 'back', '← Back to all posts');
    back.href = '#blog';
    composerView.appendChild(back);
    composerView.appendChild(el('h1', '', existing ? 'Edit post' : 'New post'));

    var form = el('form', 'editor');
    form.noValidate = true;

    var title = input('text'); title.maxLength = 140; title.value = draft.title;
    var date = input('date'); date.value = draft.date || today();
    var body = el('textarea', 'in'); body.rows = 10; body.value = draft.body;
    body.placeholder = 'What did you work on today? What worked, what did not, what is next?';

    form.appendChild(field('f-title', 'Title (optional)', title, 'Leave it empty for a quick update.'));
    form.appendChild(field('f-date', 'Date', date));
    form.appendChild(field('f-body', 'Post', body, 'A blank line starts a new paragraph. Start a line with ## for a heading or - for a bullet. Write [text](https://address) or paste a web address to make a link. Use `backticks` for code, or lines of three backticks around a code block.'));

    // links
    var linksField = el('div', 'field');
    linksField.appendChild(el('span', 'label', 'Links'));
    var linksBox = el('div', 'rows');
    linksField.appendChild(linksBox);
    var addLink = el('button', 'mini', 'Add a link');
    addLink.type = 'button';
    linksField.appendChild(addLink);
    function drawLinks() {
      linksBox.textContent = '';
      draft.links.forEach(function (l, i) {
        var row = el('div', 'row');
        var lab = input('text'); lab.placeholder = 'Label (optional)'; lab.value = l.label; lab.setAttribute('aria-label', 'Label for link ' + (i + 1));
        lab.addEventListener('input', function () { l.label = lab.value; });
        var url = input('text'); url.placeholder = 'https://...'; url.value = l.url; url.setAttribute('inputmode', 'url'); url.setAttribute('aria-label', 'Address for link ' + (i + 1));
        url.addEventListener('input', function () { l.url = url.value; });
        var rm = el('button', 'mini danger', 'Remove');
        rm.type = 'button';
        rm.addEventListener('click', function () { draft.links.splice(i, 1); drawLinks(); });
        row.appendChild(lab); row.appendChild(url); row.appendChild(rm);
        linksBox.appendChild(row);
      });
    }
    addLink.addEventListener('click', function () { draft.links.push({ label: '', url: '' }); drawLinks(); });
    drawLinks();
    form.appendChild(linksField);

    // pictures
    var picsField = el('div', 'field');
    picsField.appendChild(el('span', 'label', 'Pictures'));
    var imgBox = el('div', 'rows');
    picsField.appendChild(imgBox);
    var files = input('file');
    files.accept = 'image/jpeg,image/png,image/webp,image/gif';
    files.multiple = true;
    picsField.appendChild(field('f-files', 'Add pictures', files, 'JPEG, PNG, WebP or GIF. Large pictures are resized to 1600 pixels on the longest side before saving.'));
    function drawImages() {
      imgBox.textContent = '';
      draft.images.forEach(function (im, i) {
        var row = el('div', 'imgrow');
        var th = el('img');
        th.src = im.existing ? imgSrc(im.src) : im.dataUrl;
        th.alt = '';
        var fields = el('div', 'fields');
        var alt = input('text'); alt.placeholder = 'Describe the picture (read aloud by screen readers)'; alt.value = im.alt; alt.setAttribute('aria-label', 'Description for picture ' + (i + 1));
        alt.addEventListener('input', function () { im.alt = alt.value; });
        var cap = input('text'); cap.placeholder = 'Caption (optional)'; cap.value = im.caption; cap.setAttribute('aria-label', 'Caption for picture ' + (i + 1));
        cap.addEventListener('input', function () { im.caption = cap.value; });
        fields.appendChild(alt); fields.appendChild(cap);
        var rm = el('button', 'mini danger', 'Remove');
        rm.type = 'button';
        rm.addEventListener('click', function () {
          if (im.existing) removedSrcs.push(im.src);
          draft.images.splice(i, 1);
          drawImages();
        });
        row.appendChild(th); row.appendChild(fields); row.appendChild(rm);
        imgBox.appendChild(row);
      });
    }
    files.addEventListener('change', async function () {
      var chosen = Array.prototype.slice.call(files.files);
      files.value = '';
      for (var i = 0; i < chosen.length; i++) {
        try {
          setStatus('Preparing ' + chosen[i].name + '...');
          var im = await processImage(chosen[i]);
          draft.images.push({ existing: false, dataUrl: im.dataUrl, base64: im.base64, ext: im.ext, alt: '', caption: '' });
          drawImages();
          setStatus('');
        } catch (e) { setStatus(e.message || 'Could not add that picture.'); }
      }
    });
    drawImages();
    form.appendChild(picsField);

    var actions = el('div', 'actions');
    var submit = el('button', 'btn', 'Publish');
    submit.type = 'submit';
    var cancel = el('a', 'mini', 'Cancel');
    cancel.href = '#blog';
    var st = el('span', 'status-msg');
    st.setAttribute('aria-live', 'polite');
    actions.appendChild(submit); actions.appendChild(cancel); actions.appendChild(st);
    form.appendChild(actions);

    form.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      if (busy) return;
      var t = title.value.trim();
      var b = body.value.replace(/\s+$/, '');
      if (!t && !b && !draft.images.length) { setStatus('Write something or add a picture first.'); return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date.value)) { setStatus('Pick a date.'); return; }
      var links = [];
      for (var k = 0; k < draft.links.length; k++) {
        var row = draft.links[k];
        if (!String(row.url).trim()) continue;
        var u = normUrl(row.url);
        if (!u) { setStatus('Link ' + (k + 1) + ' is not a valid web address.'); return; }
        links.push({ label: String(row.label).trim() || hostOf(u), url: u });
      }
      var id = draft.id || makeId(t, date.value);
      var newFiles = [], images = [];
      draft.images.forEach(function (im, n) {
        if (im.existing) {
          images.push({ src: im.src, alt: im.alt.trim(), caption: im.caption.trim() });
        } else {
          var path = 'images/' + id + '-' + (n + 1) + '-' + rand(4) + '.' + im.ext;
          newFiles.push({ path: path, base64: im.base64 });
          localImages[path] = im.dataUrl;
          images.push({ src: path, alt: im.alt.trim(), caption: im.caption.trim() });
        }
      });
      var post = { id: id, date: date.value, title: t, body: b, links: links, images: images };
      var removed = removedSrcs.slice();
      var isEdit = !!draft.id;
      busy = true;
      submit.disabled = true;
      setStatus('Publishing...');
      try {
        posts = await commit((isEdit ? 'Update post: ' : 'Add post: ') + (t || id), function (current) {
          var next = isEdit && current.some(function (p) { return p.id === id; })
            ? current.map(function (p) { return p.id === id ? post : p; })
            : [post].concat(current);
          return { posts: next, deletePaths: removed };
        }, newFiles);
        loaded = true;
        notice = (isEdit ? 'Post updated.' : 'Post published.') + ' The public site shows it in about a minute.';
        busy = false;
        location.hash = '#blog';
      } catch (e) {
        busy = false;
        submit.disabled = false;
        setStatus(explain(e));
      }
    });

    composerView.appendChild(form);
    document.title = (existing ? 'Edit post' : 'New post') + ' | ' + TITLE;
    home.hidden = true; reader.hidden = true; ownerView.hidden = true;
    composerView.hidden = false;
  }

  async function deletePost(p) {
    if (busy) return;
    busy = true;
    say('Deleting...');
    refreshViews();
    try {
      posts = await commit('Delete post: ' + (p.title || p.id), function (current) {
        var target = null;
        current.forEach(function (x) { if (x.id === p.id) target = x; });
        return { posts: current.filter(function (x) { return x.id !== p.id; }), deletePaths: target ? target.images.map(function (im) { return im.src; }) : [] };
      }, []);
      notice = 'Post deleted. The public site updates in about a minute.';
    } catch (e) {
      notice = explain(e);
    }
    busy = false;
    pendingDelete = null;
    if (location.hash.slice(1) === 'post-' + p.id && !find(p.id)) location.hash = '#blog';
    else { refreshViews(); setStatus(notice); }
  }

  /* ---------- owner sign-in ---------- */
  function parseRepo(v) {
    var t = String(v).trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '');
    return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(t) ? t : null;
  }
  async function verify(repo, token) {
    var res = await fetch(API + '/repos/' + repo, { headers: headers(token, false) });
    if (res.status === 401) throw new Error('GitHub did not accept that token.');
    if (res.status === 404) throw new Error('GitHub could not find that repository with this token. Check the name and that the token has access to it.');
    if (!res.ok) throw new Error('GitHub returned an error (' + res.status + ').');
    var j = await res.json();
    if (j.permissions && j.permissions.push === false) throw new Error('This account cannot write to that repository.');
    return j;
  }
  function showOwner() {
    ownerView.textContent = '';
    var back = el('a', 'back', '← Back to the site');
    back.href = '#blog';
    ownerView.appendChild(back);
    ownerView.appendChild(el('h1', '', 'Owner sign-in'));
    if (cfg) {
      ownerView.appendChild(el('p', '', 'You are signed in. Posts are saved to ' + cfg.repo + ' on the ' + cfg.branch + ' branch.'));
      var out = el('button', 'btn', 'Sign out');
      out.type = 'button';
      out.addEventListener('click', function () { cfg = null; clearCfg(); notice = ''; location.hash = '#blog'; renderHome(); });
      ownerView.appendChild(out);
    } else {
      ownerView.appendChild(el('p', '', 'Only the site owner can add, change or delete posts. Sign in with a GitHub access token that can write to this site\'s repository. The token is kept in this browser only and is sent only to GitHub.'));
      var form = el('form', 'editor');
      form.noValidate = true;
      var repo = input('text'); repo.placeholder = 'your-username/your-repository'; repo.autocomplete = 'off'; repo.spellcheck = false;
      var token = input('password'); token.autocomplete = 'off'; token.spellcheck = false;
      form.appendChild(field('o-repo', 'Repository', repo, 'The repository that holds this site, written as owner/name.'));
      form.appendChild(field('o-token', 'Access token', token, 'A fine-grained personal access token limited to that one repository, with Contents set to Read and write.'));
      var actions = el('div', 'actions');
      var go = el('button', 'btn', 'Sign in');
      go.type = 'submit';
      var st = el('span', 'status-msg');
      st.setAttribute('aria-live', 'polite');
      actions.appendChild(go); actions.appendChild(st);
      form.appendChild(actions);
      form.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        var r = parseRepo(repo.value), tk = token.value.trim();
        if (!r) { setStatus('Write the repository as owner/name.'); return; }
        if (!tk) { setStatus('Paste your access token.'); return; }
        go.disabled = true;
        setStatus('Checking with GitHub...');
        try {
          var info = await verify(r, tk);
          cfg = { repo: r, token: tk, branch: info.default_branch || 'main' };
          var kept = saveCfg();
          notice = kept ? '' : 'Signed in for this visit only, because this browser would not store the token.';
          await refreshFromRepo();
          location.hash = '#blog';
          renderHome();
        } catch (e) {
          go.disabled = false;
          setStatus(explain(e));
        }
      });
      ownerView.appendChild(form);
      var det = el('details', 'steps');
      det.appendChild(el('summary', '', 'How to get a token'));
      var ol = el('ol');
      [
        'On GitHub, open Settings, then Developer settings, then Personal access tokens, then Fine-grained tokens.',
        'Choose Generate new token and give it a name such as Portfolio posting.',
        'Under Repository access, choose Only select repositories and pick this site\'s repository.',
        'Under Permissions, open Repository permissions and set Contents to Read and write.',
        'Generate the token, copy it, and paste it above.'
      ].forEach(function (s) { ol.appendChild(el('li', '', s)); });
      det.appendChild(ol);
      ownerView.appendChild(det);
    }
    document.title = 'Owner sign-in | ' + TITLE;
    home.hidden = true; reader.hidden = true; composerView.hidden = true;
    ownerView.hidden = false;
  }

  /* ---------- routing ---------- */
  function showHome(h, scroll) {
    document.title = TITLE;
    reader.hidden = true; composerView.hidden = true; ownerView.hidden = true;
    home.hidden = false;
    renderHome();
    if (scroll) {
      var t = h && document.getElementById(h);
      if (t) t.scrollIntoView(); else window.scrollTo(0, 0);
    }
  }
  function route(scroll) {
    var h = location.hash.slice(1);
    var p;
    if (h === 'owner') { showOwner(); if (scroll) window.scrollTo(0, 0); return; }
    if (h === 'new-post' || h.indexOf('edit-') === 0) {
      if (!cfg) { location.hash = '#owner'; return; }
      if (h === 'new-post') { showComposer(null); if (scroll) window.scrollTo(0, 0); return; }
      p = find(h.slice(5));
      if (p) { showComposer(p); if (scroll) window.scrollTo(0, 0); return; }
      if (!loaded) { showHome('blog', false); return; }
      location.hash = '#blog';
      return;
    }
    if (h.indexOf('post-') === 0) {
      p = find(h.slice(5));
      if (p) { showPost(p); if (scroll) window.scrollTo(0, 0); return; }
      if (!loaded) { showHome(null, false); return; }
      showHome('blog', scroll);
      return;
    }
    showHome(h, scroll);
  }

  /* ---------- theme and copy ---------- */
  function bindTheme() {
    var btn = $('themeBtn');
    var root = document.documentElement;
    btn.addEventListener('click', function () {
      var explicit = root.getAttribute('data-theme');
      var isDark = explicit ? explicit === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
      var next = isDark ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
    });
  }
  function bindCopy() {
    var copyBtn = $('copyBtn'), copyNote = $('copyNote'), emailText = $('emailText');
    copyBtn.addEventListener('click', function () {
      function fallback() {
        var rg = document.createRange();
        rg.selectNodeContents(emailText);
        var s = window.getSelection();
        s.removeAllRanges();
        s.addRange(rg);
        copyNote.textContent = 'Email selected. Press copy on your keyboard or menu.';
      }
      try {
        navigator.clipboard.writeText(emailText.textContent).then(function () { copyNote.textContent = 'Email copied.'; }, fallback);
      } catch (e) { fallback(); }
    });
  }

  /* ---------- start ---------- */
  cfg = loadCfg();
  bindTheme();
  bindCopy();
  // Show the resume download only when resume.pdf is actually in the repository.
  fetch('resume.pdf', { method: 'HEAD', cache: 'no-cache' }).then(function (r) {
    if (r.ok) { $('resume').hidden = false; $('resumeNav').hidden = false; }
  }).catch(function () {});
  window.addEventListener('hashchange', function () { pendingDelete = null; route(true); });
  route(false);

  fetch('posts.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
    .then(function (d) { posts = clean(d); loaded = true; loadNote.hidden = true; })
    .catch(function () {
      loadNote.hidden = false;
      loadNote.textContent = 'The posts could not be loaded. If you opened this file straight from a folder, view the site on GitHub Pages or through a local web server instead.';
    })
    .then(function () { renderHome(); route(false); return refreshFromRepo(); });
})();
