import { AddRecords } from '../components/AddRecords'
import { Overlay } from '../components/Overlay'

/** Add records · voice or text (Settings › Records, the Vitamins sheet). */
export function TellScreen({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Overlay open={open} onClose={onClose} title="Add records · voice or text">
      {open && <AddRecords />}
    </Overlay>
  )
}
