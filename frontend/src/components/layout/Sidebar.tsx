import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutGrid, LogOut, Menu, Eye, BarChart2,
  Table2, ChevronRight, Sun, Moon,
} from 'lucide-react';
import { useAuthStore } from '../../stores/auth.store';
import { useThemeStore } from '../../stores/theme.store';

interface NavItem {
  to?: string;
  icon: React.ElementType;
  label: string;
  children?: { to: string; label: string }[];
}

const nav: NavItem[] = [
  {
    icon: Table2,
    label: 'Tabelas',
    children: [
      // Itens serão adicionados futuramente
    ],
  },
  { to: '/visualizacao', icon: Eye,        label: 'Visualização Ações PGD' },
  {
    icon: BarChart2,
    label: 'Dashboards',
    children: [],
  },
  { to: '/acoes',        icon: LayoutGrid, label: 'Ações' },
];

export default function Sidebar() {
  const { user, logout } = useAuthStore();
  const { theme, toggle } = useThemeStore();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  const isDark = theme === 'dark';

  function toggleGroup(label: string, firstChild?: string) {
    if (collapsed) {
      setCollapsed(false);
      setOpen(label);
    } else if (open === label) {
      setOpen(null);
    } else {
      setOpen(label);
      if (firstChild) navigate(firstChild);
    }
  }

  return (
    <aside
      className={`min-h-screen flex flex-col border-r transition-all duration-200 shrink-0 ${
        collapsed ? 'w-14' : 'w-56'
      } ${
        isDark
          ? 'bg-[#1a1d23] border-gray-800'
          : 'bg-white border-gray-200'
      }`}
    >
      {/* Header */}
      <div className={`flex items-center border-b h-14 px-3 ${
        isDark ? 'border-gray-800' : 'border-gray-200'
      } ${collapsed ? 'justify-center' : 'justify-between'}`}>
        {!collapsed && (
          <div>
            <h1 className={`font-bold text-base leading-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>PGD</h1>
            <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Adubos Real</p>
          </div>
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className={`p-1.5 rounded-lg transition-colors ${
            isDark
              ? 'text-gray-400 hover:text-white hover:bg-gray-800'
              : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
          }`}
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
        >
          <Menu size={18} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {nav.map((item) => {
          if (item.to) {
            return (
              <NavLink
                key={item.to}
                to={item.to}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                    collapsed ? 'justify-center' : ''
                  } ${
                    isActive
                      ? 'bg-green-600 text-white font-medium'
                      : isDark
                        ? 'text-gray-400 hover:bg-gray-800 hover:text-white'
                        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                  }`
                }
              >
                <item.icon size={16} className="shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            );
          }

          const isOpen = open === item.label;
          return (
            <div key={item.label}>
              <button
                onClick={() => toggleGroup(item.label, item.children?.[0]?.to)}
                title={collapsed ? item.label : undefined}
                className={`flex items-center gap-3 w-full px-2.5 py-2 rounded-lg text-sm transition-colors ${
                  collapsed ? 'justify-center' : 'justify-between'
                } ${
                  isDark
                    ? 'text-gray-400 hover:bg-gray-800 hover:text-white'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <span className="flex items-center gap-3">
                  <item.icon size={16} className="shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </span>
                {!collapsed && (
                  <ChevronRight
                    size={13}
                    className={`transition-transform ${isDark ? 'text-gray-600' : 'text-gray-400'} ${isOpen ? 'rotate-90' : ''}`}
                  />
                )}
              </button>

              {!collapsed && isOpen && item.children && item.children.length > 0 && (
                <div className={`ml-4 mt-0.5 space-y-0.5 border-l pl-2 ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
                  {item.children.map((child) => (
                    <NavLink
                      key={child.to}
                      to={child.to}
                      className={({ isActive }) =>
                        `block px-2 py-1.5 rounded text-xs transition-colors ${
                          isActive
                            ? 'text-white bg-green-600'
                            : isDark
                              ? 'text-gray-500 hover:text-white hover:bg-gray-800'
                              : 'text-gray-400 hover:text-gray-900 hover:bg-gray-100'
                        }`
                      }
                    >
                      {child.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className={`px-2 py-3 border-t space-y-1 ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
        {!collapsed && (
          <div className="px-2 py-1">
            <p className={`text-sm font-medium truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>{user?.name}</p>
            <p className={`text-xs truncate ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{user?.login}</p>
          </div>
        )}

        {/* Toggle de tema */}
        <button
          onClick={toggle}
          title={isDark ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
          className={`flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-sm transition-colors ${
            collapsed ? 'justify-center' : ''
          } ${
            isDark
              ? 'text-gray-400 hover:text-white hover:bg-gray-800'
              : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
          }`}
        >
          {isDark ? <Sun size={15} className="shrink-0" /> : <Moon size={15} className="shrink-0" />}
          {!collapsed && (isDark ? 'Modo claro' : 'Modo escuro')}
        </button>

        <button
          onClick={logout}
          title="Sair"
          className={`flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-sm transition-colors ${
            collapsed ? 'justify-center' : ''
          } ${
            isDark
              ? 'text-gray-400 hover:text-white hover:bg-gray-800'
              : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
          }`}
        >
          <LogOut size={15} className="shrink-0" />
          {!collapsed && 'Sair'}
        </button>
      </div>
    </aside>
  );
}
