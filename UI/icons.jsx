// Plot — Category Icons
// Hand-drawn SVG icons for each of the 11 categories.
// All drawn on a 24x24 viewBox, rounded line joins, ~2px stroke.
// Two render modes:
//  - filled: solid shapes
//  - outline: 2px stroke, no fill (default)

function CategoryIcon({ id, size = 24, color = 'currentColor', fillStyle = 'outline' }) {
  const filled = fillStyle === 'filled';
  const stroke = filled ? 'none' : color;
  const fill = filled ? color : 'none';
  const sw = 2;

  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    style: { display: 'block' },
  };

  const lineProps = {
    stroke: color, strokeWidth: sw,
    strokeLinecap: 'round', strokeLinejoin: 'round',
    fill: 'none',
  };
  const shapeProps = {
    stroke, strokeWidth: sw,
    strokeLinecap: 'round', strokeLinejoin: 'round',
    fill,
  };

  switch (id) {
    case 'food': // martini glass
      return (
        <svg {...common}>
          <path d="M 4 5 L 20 5 L 13 13 L 13 19" {...lineProps} />
          <path d="M 11 13 L 11 19" {...lineProps} />
          <path d="M 7 19 L 17 19" {...lineProps} />
          <circle cx="16" cy="7.5" r="1.4" fill={color} />
        </svg>
      );

    case 'outdoors': // mountain + sun
      return (
        <svg {...common}>
          <circle cx="17" cy="6" r="2" {...shapeProps} />
          <path d="M 3 19 L 9 10 L 14 16 L 17 12 L 21 19 Z" {...shapeProps} />
        </svg>
      );

    case 'ent': // play triangle in circle (movie)
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" {...shapeProps} />
          <path d="M 10 8.5 L 16 12 L 10 15.5 Z" fill={filled ? '#fff' : color} stroke="none" />
        </svg>
      );

    case 'arts': // diamond / gallery frame
      return (
        <svg {...common}>
          <rect x="3.5" y="3.5" width="17" height="17" rx="1.5" {...shapeProps} />
          <path d="M 12 7.5 L 16.5 12 L 12 16.5 L 7.5 12 Z" fill={filled ? '#fff' : color} stroke={filled ? '#fff' : color} strokeWidth={sw} strokeLinejoin="round" />
        </svg>
      );

    case 'night': // moon
      return (
        <svg {...common}>
          <path d="M 19 14 A 8 8 0 1 1 10 5 A 6 6 0 0 0 19 14 Z" {...shapeProps} />
          <circle cx="6" cy="9" r="0.8" fill={color} />
          <circle cx="20" cy="6" r="0.8" fill={color} />
        </svg>
      );

    case 'sports': // basketball
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" {...shapeProps} />
          <path d="M 3 12 L 21 12 M 12 3 L 12 21 M 5.5 5.5 C 9 9, 9 15, 5.5 18.5 M 18.5 5.5 C 15 9, 15 15, 18.5 18.5"
                stroke={filled ? '#fff' : color} strokeWidth={sw * 0.9} strokeLinecap="round" fill="none" />
        </svg>
      );

    case 'wellness': // flower / lotus
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="2.2" fill={color} />
          <ellipse cx="12" cy="6" rx="2.2" ry="3.5" {...shapeProps} />
          <ellipse cx="12" cy="18" rx="2.2" ry="3.5" {...shapeProps} />
          <ellipse cx="6" cy="12" rx="3.5" ry="2.2" {...shapeProps} />
          <ellipse cx="18" cy="12" rx="3.5" ry="2.2" {...shapeProps} />
        </svg>
      );

    case 'shop': // shopping bag
      return (
        <svg {...common}>
          <path d="M 5 8 L 19 8 L 18 20 L 6 20 Z" {...shapeProps} />
          <path d="M 9 8 L 9 5.5 A 3 3 0 0 1 15 5.5 L 15 8" {...lineProps} />
        </svg>
      );

    case 'classes': // pencil / craft
      return (
        <svg {...common}>
          <path d="M 4 20 L 7 17 L 17 7 L 20 10 L 10 20 Z" {...shapeProps} />
          <path d="M 14 4 L 20 10" {...lineProps} />
          <path d="M 4 20 L 7 17" stroke={filled ? '#fff' : color} strokeWidth={sw} strokeLinecap="round" />
        </svg>
      );

    case 'pets': // paw print
      return (
        <svg {...common}>
          <ellipse cx="6.5" cy="9" rx="1.6" ry="2.2" fill={color} />
          <ellipse cx="10.5" cy="6" rx="1.6" ry="2.2" fill={color} />
          <ellipse cx="14.5" cy="6" rx="1.6" ry="2.2" fill={color} />
          <ellipse cx="18.5" cy="9" rx="1.6" ry="2.2" fill={color} />
          <path d="M 7.5 14 C 7.5 11, 16.5 11, 16.5 14 C 16.5 18, 14 19.5, 12 19.5 C 10 19.5, 7.5 18, 7.5 14 Z" fill={color} />
        </svg>
      );

    case 'music': // music note
      return (
        <svg {...common}>
          <path d="M 9 17 L 9 6 L 18 4 L 18 15" {...lineProps} />
          <ellipse cx="7" cy="17" rx="2.4" ry="2" {...shapeProps} />
          <ellipse cx="16" cy="15" rx="2.4" ry="2" {...shapeProps} />
        </svg>
      );

    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="6" {...shapeProps} />
        </svg>
      );
  }
}

window.CategoryIcon = CategoryIcon;
