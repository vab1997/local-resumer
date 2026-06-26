import { SummaryPanel } from '@/src/features/summarize/ui/SummaryPanel'
import { createRoot } from 'react-dom/client'
import './style.css'

// No StrictMode: it double-invokes effects in dev, which would spin up the heavy inference
// worker (and a model load) twice.
const root = document.getElementById('root')
if (!root) throw new Error('Side panel root element not found')
createRoot(root).render(<SummaryPanel />)
