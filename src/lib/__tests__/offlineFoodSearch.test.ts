import { describe, expect, it } from 'vitest'
import type { Food } from '@food-tracker/data-access'
import { filterFoodsOffline } from '../offlineFoodSearch'

function food(id: string, name: string): Food {
  return { id, name, householdId: 'household-1', categoryId: 'category-1', createdAt: '2026-01-01T00:00:00Z' }
}

describe('filterFoodsOffline', () => {
  it('matches a case-insensitive substring of the name', () => {
    const foods = [food('1', 'Banana'), food('2', 'Blueberry'), food('3', 'Carrot')]
    expect(filterFoodsOffline(foods, 'ban')).toEqual([food('1', 'Banana')])
    expect(filterFoodsOffline(foods, 'BLUE')).toEqual([food('2', 'Blueberry')])
  })

  it('returns matches sorted by name', () => {
    const foods = [food('1', 'Peach'), food('2', 'Pear'), food('3', 'Peas')]
    expect(filterFoodsOffline(foods, 'pea').map((f) => f.name)).toEqual(['Peach', 'Pear', 'Peas'])
  })

  it('caps results at 10, mirroring the online search limit', () => {
    const foods = Array.from({ length: 15 }, (_, i) => food(String(i), `Apple ${String(i).padStart(2, '0')}`))
    expect(filterFoodsOffline(foods, 'apple')).toHaveLength(10)
  })

  it('returns an empty list when nothing matches', () => {
    expect(filterFoodsOffline([food('1', 'Banana')], 'zucchini')).toEqual([])
  })
})
