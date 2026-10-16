// Progressive enhancement only: Netlify keeps handling the native HTML POST.
(() => {
  const form = document.querySelector('form[name="contact"]');
  if (!form) return;
  const status = document.getElementById("contact-status");
  const submit = form.querySelector('button[type="submit"]');
  const host = location.hostname.toLowerCase();
  const isPreview = host === "localhost" || host === "127.0.0.1" ||
    host === "[::1]" || /\.(replit\.dev|replit\.app|repl\.co)$/.test(host);

  if (isPreview) {
    status.textContent = "Development preview: sending is unavailable here. Nothing will be submitted or delivered. To contact us, use the email link in your own email app.";
    submit.disabled = true;
    submit.textContent = "Sending unavailable in preview";
  }

  form.addEventListener("submit", (event) => {
    if (isPreview) {
      event.preventDefault();
      status.textContent = "Nothing sent. This Replit development preview does not process contact messages. Use the email link if you want to contact us.";
    } else if (navigator.onLine === false) {
      event.preventDefault();
      status.textContent = "Nothing sent: your browser reports that you are offline. Reconnect and try again, or use your email app. Your entries remain in this form.";
    } else {
      // Do not intercept or replace Netlify's native submission with a fake success.
      status.textContent = "Submitting to Netlify. Sending is not confirmed until the next page appears. If an error occurs, return here to retry or use the email link.";
    }
  });
})();
