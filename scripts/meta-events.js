(function () {
    function hasFbq() {
        return typeof window.fbq === 'function';
    }

    function track(eventName, params) {
        if (!hasFbq()) return;
        window.fbq('track', eventName, params || {});
    }

    window.trackMetaEvent = track;

    document.addEventListener('click', function (event) {
        const link = event.target.closest('a[href]');
        if (!link) return;

        const href = link.getAttribute('href') || '';
        const normalizedHref = href.toLowerCase();

        if (normalizedHref.indexOf('lin.ee/mdzezrk') !== -1) {
            track('Contact', {
                content_name: 'LINE',
                contact_method: 'line',
                page_path: window.location.pathname
            });
            return;
        }

        if (normalizedHref.indexOf('tel:') === 0) {
            track('Contact', {
                content_name: 'Phone',
                contact_method: 'phone',
                page_path: window.location.pathname,
                phone_number: href.replace(/^tel:/i, '')
            });
        }
    }, true);
})();
