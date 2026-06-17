content = open(r"E:\moontv\MoonTV\src\components\Sidebar.tsx", encoding="utf-8").read()

# Remove CalendarDays from import
old_imp = "import { CalendarDays, Cat, Clover, Film, Home, Menu, Radio, Search, Star, Tv } from 'lucide-react';"
new_imp = "import { Cat, Clover, Film, Home, Menu, Radio, Search, Star, Tv } from 'lucide-react';"
content = content.replace(old_imp, new_imp)

# Find and remove the anime schedule menu item block
# Search for the block from "{ icon: CalendarDays" to the closing "},"
marker = "icon: CalendarDays"
idx = content.find(marker)
if idx >= 0:
    # Find the opening brace before this marker
    start = content.rfind("{", 0, idx)
    # Find the closing "}," after this marker
    end = content.find("},", idx) + 2
    content = content[:start] + content[end:]

open(r"E:\moontv\MoonTV\src\components\Sidebar.tsx", "w", encoding="utf-8").write(content)
print("Sidebar updated")
