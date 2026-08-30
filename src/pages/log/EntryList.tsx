import type { Child, Food, LogEntry, ReasonTag } from '@food-tracker/data-access'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'
import {
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Rating,
  Stack,
  Typography,
} from '@mui/material'
import { nameById, reasonTagNames, statusLabel } from '../../lib/entryFormatting'

/** "Recent entries" list -- read back from Supabase (ticket 12). Presentational:
 * clicking a row opens the detail view, the edit/delete affordances raise up to
 * the coordinator. */
export function EntryList({
  entries,
  childProfiles,
  foods,
  reasonTags,
  entryIdsWithPhotos,
  onView,
  onEdit,
  onDelete,
}: {
  entries: LogEntry[]
  childProfiles: Child[]
  foods: Food[]
  reasonTags: ReasonTag[]
  entryIdsWithPhotos: Set<string>
  onView: (entry: LogEntry) => void
  onEdit: (entry: LogEntry) => void
  onDelete: (entry: LogEntry) => void
}) {
  return (
    <List sx={{ bgcolor: 'background.paper', borderRadius: 1 }}>
      {entries.length === 0 && (
        <ListItem>
          <ListItemText primary="No entries yet." />
        </ListItem>
      )}
      {entries.map((entry) => (
        <ListItem
          key={entry.id}
          alignItems="flex-start"
          disablePadding
          secondaryAction={
            <Stack direction="row" spacing={0.5}>
              <IconButton edge="end" aria-label="Edit entry" onClick={() => onEdit(entry)}>
                <EditIcon fontSize="small" />
              </IconButton>
              <IconButton edge="end" aria-label="Delete entry" onClick={() => onDelete(entry)}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Stack>
          }
        >
          <ListItemButton alignItems="flex-start" onClick={() => onView(entry)} sx={{ pr: 10 }}>
            <ListItemText
              primary={
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                  <Typography component="span" sx={{ fontWeight: 500 }}>
                    {nameById(childProfiles, entry.childId)} — {nameById(foods, entry.foodId)}
                  </Typography>
                  <Chip size="small" label={statusLabel(entry.status)} />
                  {entry.intensity !== null && <Rating size="small" value={entry.intensity} max={5} readOnly />}
                  {entryIdsWithPhotos.has(entry.id) && (
                    <PhotoCameraIcon fontSize="small" color="action" titleAccess="Has photos" />
                  )}
                </Stack>
              }
              secondary={
                <>
                  {new Date(entry.occurredAt).toLocaleString()} — {reasonTagNames(reasonTags, entry.reasonTagIds)}
                  {entry.notes ? ` — "${entry.notes}"` : ''}
                </>
              }
            />
          </ListItemButton>
        </ListItem>
      ))}
    </List>
  )
}
