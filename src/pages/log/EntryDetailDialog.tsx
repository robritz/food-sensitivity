import {
  getLogEntryPhotoUrl,
  listLogEntryPhotos,
  type Child,
  type Food,
  type LogEntry,
  type LogEntryPhoto,
  type ReasonTag,
} from '@food-tracker/data-access'
import CloseIcon from '@mui/icons-material/Close'
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Rating,
  Stack,
  Typography,
} from '@mui/material'
import { useEffect, useState } from 'react'
import { dataAccessClient } from '../../lib/dataAccessClient'
import { sortLogEntryPhotos } from '../../lib/entryPhotos'
import { nameById, reasonTagNames, statusLabel } from './logHelpers'

/** Single-entry detail view (ticket 17), including the full-size photo
 * lightbox. Fetches the entry's photos fresh each time it opens -- the signed
 * URLs expire after 60s (private bucket), so they're never persisted onto the
 * list, only held here while the dialog is open. A rapid A-then-B open is
 * handled by the effect's `cancelled` cleanup: B's fetch supersedes A's, and
 * A's late result is discarded rather than clobbering B's photos. */
export function EntryDetailDialog({
  entry,
  childProfiles,
  foods,
  reasonTags,
  onClose,
}: {
  entry: LogEntry | null
  childProfiles: Child[]
  foods: Food[]
  reasonTags: ReasonTag[]
  onClose: () => void
}) {
  const [photos, setPhotos] = useState<LogEntryPhoto[]>([])
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lightboxPath, setLightboxPath] = useState<string | null>(null)

  useEffect(() => {
    if (!entry) return
    let cancelled = false
    setPhotos([])
    setPhotoUrls({})
    setError(null)
    setLightboxPath(null)
    setLoading(true)
    listLogEntryPhotos(dataAccessClient, entry.id)
      .then(async (fetched) => {
        const sorted = sortLogEntryPhotos(fetched)
        const urls = await Promise.all(sorted.map((photo) => getLogEntryPhotoUrl(dataAccessClient, photo.path)))
        if (cancelled) return
        setPhotos(sorted)
        setPhotoUrls(Object.fromEntries(sorted.map((photo, index) => [photo.path, urls[index]])))
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load photos.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [entry])

  return (
    <>
      <Dialog open={entry !== null} onClose={onClose} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {entry ? `${nameById(childProfiles, entry.childId)} — ${nameById(foods, entry.foodId)}` : ''}
          <IconButton aria-label="Close" onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {entry && (
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <Chip size="small" label={statusLabel(entry.status)} />
                {entry.intensity !== null && <Rating size="small" value={entry.intensity} max={5} readOnly />}
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {new Date(entry.occurredAt).toLocaleString()}
              </Typography>
              <Typography variant="body2">Reasons: {reasonTagNames(reasonTags, entry.reasonTagIds)}</Typography>
              {entry.notes && <Typography variant="body2">"{entry.notes}"</Typography>}

              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Photos
                </Typography>
                {loading && (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                    <CircularProgress size={24} />
                  </Box>
                )}
                {error && <Alert severity="error">{error}</Alert>}
                {!loading && !error && photos.length === 0 && (
                  <Typography variant="body2" color="text.secondary">
                    No photos attached to this entry.
                  </Typography>
                )}
                {!loading && !error && photos.length > 0 && (
                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                    {photos.map((photo) => (
                      <Box
                        key={photo.path}
                        component="button"
                        type="button"
                        onClick={() => setLightboxPath(photo.path)}
                        aria-label={`View ${photo.name} full size`}
                        sx={{
                          p: 0,
                          border: 'none',
                          borderRadius: 1,
                          overflow: 'hidden',
                          cursor: 'pointer',
                          bgcolor: 'transparent',
                          lineHeight: 0,
                        }}
                      >
                        <Box
                          component="img"
                          src={photoUrls[photo.path]}
                          alt={photo.name}
                          // Fit within a 96px box preserving aspect ratio
                          // (ticket 25) rather than cropping to a square, so
                          // the whole photo shows -- edges and all.
                          sx={{ maxWidth: 96, maxHeight: 96, display: 'block' }}
                        />
                      </Box>
                    ))}
                  </Stack>
                )}
              </Box>
            </Stack>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={lightboxPath !== null} onClose={() => setLightboxPath(null)} maxWidth="lg">
        <DialogContent
          sx={{ p: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', bgcolor: 'common.black' }}
        >
          {lightboxPath && (
            <Box
              component="img"
              src={photoUrls[lightboxPath]}
              alt=""
              sx={{ maxWidth: '100%', maxHeight: '80vh', display: 'block' }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
