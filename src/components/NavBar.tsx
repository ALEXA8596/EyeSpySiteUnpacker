"use client";

import React from 'react';
import Link from 'next/link';

export default function NavBar() {
  return (
    <nav className="navbar navbar-expand-lg navbar-light bg-white shadow-sm mb-4">
      <div className="container">
        <Link href="/" className="navbar-brand">
          EyeSpy Unpacker
        </Link>
        <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav" aria-controls="navbarNav" aria-expanded="false" aria-label="Toggle navigation">
          <span className="navbar-toggler-icon" />
        </button>
        <div className="collapse navbar-collapse" id="navbarNav">
          <ul className="navbar-nav ms-auto">
            <li className="nav-item">
              <Link href="/" className="nav-link">Home</Link>
            </li>
            <li className="nav-item">
              <Link href="/podcast-editor" className="nav-link">Podcast Editor</Link>
            </li>
            <li className="nav-item">
              <Link href="/batch" className="nav-link">Batch Process</Link>
            </li>
          </ul>
        </div>
      </div>
    </nav>
  );
}
