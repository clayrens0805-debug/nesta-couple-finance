'use client';

import { useEffect, useState } from 'react';

export default function NestaHome() {
  const [appUrl, setAppUrl] = useState('/app.html');

  useEffect(() => {
    const suffix = window.location.search + window.location.hash;
    if (suffix) {
      setAppUrl('/app.html' + suffix);
    }
  }, []);

  return (
    <main className="w-screen h-screen overflow-hidden bg-[#F7F6F2]">
      <iframe
        src={appUrl}
        title="NESTA — Separate Money. Shared Life."
        className="w-full h-full border-0 block"
      />
    </main>
  );
}
