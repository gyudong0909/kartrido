import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import HostConsole from './pages/HostConsole';
import TVScreen from './pages/TVScreen';
import PlayerScreen from './pages/PlayerScreen';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/host" element={<HostConsole />} />
        <Route path="/tv/:code" element={<TVScreen />} />
        <Route path="/play/:slotToken" element={<PlayerScreen />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
