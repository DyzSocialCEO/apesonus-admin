/**
 * THE CODE ROSTER — single shared list of the artists that live in code.
 *
 * This used to exist as three private copies (tracks page, artist-covers
 * route, and the roster file) that drifted apart. This is now the only
 * copy. Fresh artists created from the ADD ARTIST form do NOT go here;
 * they live in the `artists` table and every surface merges the two via
 * /api/admin/artists.
 */
export const CODE_ARTISTS = [
  { id: "chartnobyl-bro",    name: "Chartnobyl Bro"    },
  { id: "coinalisa",         name: "Coinalisa"          },
  { id: "dj-dustwallet",     name: "DJ Dustwallet"      },
  { id: "lola-likwidity",    name: "Lola Likwidity"     },
  { id: "mcbagholder",       name: "McBagholder"        },
  { id: "shilliam-dafoe",    name: "Shilliam Dafoe"     },
  { id: "satosheek",         name: "Satosheek"          },
  { id: "shim-liquidation",  name: "Shim Liquidation"   },
  { id: "rektina-loprez",    name: "Rektina Loprez"     },
] as const

export interface RosterEntry {
  id: string
  name: string
  source: "code" | "db"
  tagline?: string
  is_active?: boolean
}

/** Slugify a display name the same way the PWA resolves artist ids. */
export function slugifyArtistName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}
