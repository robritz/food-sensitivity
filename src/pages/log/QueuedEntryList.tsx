import type { Child, Food, QueuedLogEntry, ReasonTag } from '@food-tracker/data-access'
import { Chip, List, ListItem, ListItemText, Stack, Typography } from '@mui/material'
import { nameById, reasonTagNames } from './logHelpers'

/** Entries created offline (ticket 11), queued in IndexedDB and shown
 * separately from "Recent entries" so it's visibly "queued, not yet on the
 * server". Rendered only when non-empty by the coordinator. */
export function QueuedEntryList({
  queuedEntries,
  childProfiles,
  foods,
  reasonTags,
}: {
  queuedEntries: QueuedLogEntry[]
  childProfiles: Child[]
  foods: Food[]
  reasonTags: ReasonTag[]
}) {
  return (
    <>
      <Typography variant="h6" component="h2" gutterBottom>
        Queued (offline)
      </Typography>
      <List sx={{ bgcolor: 'background.paper', borderRadius: 1, mb: 3 }}>
        {queuedEntries.map((queuedEntry) => (
          <ListItem key={queuedEntry.clientId} alignItems="flex-start">
            <ListItemText
              primary={
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                  <Typography component="span" sx={{ fontWeight: 500 }}>
                    {nameById(childProfiles, queuedEntry.input.childId)} — {nameById(foods, queuedEntry.input.foodId)}
                  </Typography>
                  <Chip size="small" color="warning" label="Queued — will sync when back online" />
                </Stack>
              }
              secondary={
                <>
                  {new Date(queuedEntry.input.occurredAt ?? new Date().toISOString()).toLocaleString()} —{' '}
                  {reasonTagNames(reasonTags, queuedEntry.input.reasonTagIds)}
                  {queuedEntry.photos.length > 0 ? ` — ${queuedEntry.photos.length} photo(s) pending upload` : ''}
                </>
              }
            />
          </ListItem>
        ))}
      </List>
    </>
  )
}
