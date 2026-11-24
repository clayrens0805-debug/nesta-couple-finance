'use client';

import { useEffect } from 'react';

export default function NestaHome() {
  useEffect(() => {
    window.location.replace('/app.html' + window.location.search + window.location.hash);
  }, []);

  return null;
}
