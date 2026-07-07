import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Review from './pages/Review'
import Documents from './pages/Documents'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/documents" element={<Documents />} />
        <Route path="/review/:id" element={<Review />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
