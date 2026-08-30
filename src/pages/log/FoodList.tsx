import type { Category, Food } from '@food-tracker/data-access'
import { List, ListItem, ListItemText } from '@mui/material'
import { nameById } from '../../lib/entryFormatting'

/** "All foods" reference list at the bottom of the page -- the household's
 * accumulated Food catalog, each under its category. */
export function FoodList({ foods, categories }: { foods: Food[]; categories: Category[] }) {
  return (
    <List dense sx={{ bgcolor: 'background.paper', borderRadius: 1 }}>
      {foods.length === 0 && (
        <ListItem>
          <ListItemText primary="No foods yet." />
        </ListItem>
      )}
      {foods.map((food) => (
        <ListItem key={food.id}>
          <ListItemText primary={food.name} secondary={nameById(categories, food.categoryId)} />
        </ListItem>
      ))}
    </List>
  )
}
