// Quick test to fetch the index page and check for errors
fetch('http://localhost:8080/')
  .then(r => {
    console.log('Status:', r.status);
    return r.text();
  })
  .then(html => {
    if (html.includes('This page didn')) {
      console.log('ERROR PAGE DETECTED in SSR!');
    } else {
      console.log('SSR looks fine, length:', html.length);
    }
  })
  .catch(e => console.error('Fetch error:', e.message));
