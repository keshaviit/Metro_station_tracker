---
name: Aura Professional Light
colors:
  surface: '#fcf8ff'
  surface-dim: '#dbd8e4'
  surface-bright: '#fcf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f2fe'
  surface-container: '#efecf8'
  surface-container-high: '#e9e6f3'
  surface-container-highest: '#e4e1ed'
  on-surface: '#1b1b23'
  on-surface-variant: '#464554'
  inverse-surface: '#303038'
  inverse-on-surface: '#f2effb'
  outline: '#767586'
  outline-variant: '#c7c4d7'
  surface-tint: '#494bd6'
  primary: '#4648d4'
  on-primary: '#ffffff'
  primary-container: '#6063ee'
  on-primary-container: '#fffbff'
  inverse-primary: '#c0c1ff'
  secondary: '#5a5f62'
  on-secondary: '#ffffff'
  secondary-container: '#dce0e4'
  on-secondary-container: '#5e6367'
  tertiary: '#904900'
  on-tertiary: '#ffffff'
  tertiary-container: '#b55d00'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e1e0ff'
  primary-fixed-dim: '#c0c1ff'
  on-primary-fixed: '#07006c'
  on-primary-fixed-variant: '#2f2ebe'
  secondary-fixed: '#dfe3e7'
  secondary-fixed-dim: '#c3c7cb'
  on-secondary-fixed: '#171c1f'
  on-secondary-fixed-variant: '#43474b'
  tertiary-fixed: '#ffdcc5'
  tertiary-fixed-dim: '#ffb783'
  on-tertiary-fixed: '#301400'
  on-tertiary-fixed-variant: '#703700'
  background: '#fcf8ff'
  on-background: '#1b1b23'
  surface-variant: '#e4e1ed'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
  title-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 48px
---

## Brand & Style

The design system is engineered for high-utility transit environments where clarity, calm, and efficiency are paramount. The brand personality is professional and reliable, utilizing a refined **Minimalist** aesthetic with subtle **Glassmorphic** accents to suggest modern technology without sacrificing readability.

The target audience consists of daily commuters and travelers who require immediate access to complex data. The UI evokes a sense of order through generous whitespace, high-contrast typography, and soft, translucent layers that provide depth without visual clutter.

## Colors

The palette is anchored in a "Clean White" primary surface to maximize brightness and perceived space. **Indigo (#6366F1)** serves as the primary action color, providing a strong, recognizable focal point for navigation and primary buttons. 

- **Primary Surface:** pure white for maximum clarity.
- **Surface Variants:** Soft Grey and Muted Slate are used for grouping content and separating navigation elements.
- **Typography:** Deep Charcoal provides rigorous legibility for headers, while Slate Grey handles metadata and secondary descriptions to maintain visual hierarchy.

## Typography

The design system utilizes **Inter** exclusively to leverage its systematic, utilitarian nature. The type scale focuses on functional density, ensuring that transit times and location data are prominent.

Tight letter spacing is applied to larger headlines to maintain a premium feel, while labels utilize increased tracking for legibility at small sizes. Weights are used strategically: Semibold for interactive elements and Regular for long-form informational text.

## Layout & Spacing

This design system employs a **Fluid Grid** model based on a 4px baseline rhythm. For mobile, a 4-column layout is used with 16px margins. Desktop layouts expand to a 12-column grid with a maximum content width of 1280px.

Spacing is designed to be "airy" yet organized. Use `lg` (24px) spacing for major component grouping and `sm` (8px) for internal element relationships (e.g., icon to text).

## Elevation & Depth

Elevation in this design system is achieved through **Light Glassmorphism** and soft, ambient shadows. Layers should feel like stacked sheets of translucent vellum.

- **Level 1 (Base):** Clean White (#FFFFFF).
- **Level 2 (Translucent Panels):** Surface color at 80% opacity with a subtle 4px backdrop blur.
- **Shadows:** Use extremely soft, low-opacity shadows (Blur: 12px, Y: 4px, Color: #1E293B at 5% alpha) to lift interactive cards off the base surface without creating heavy dark spots.
- **Outlines:** Use a 1px border in Muted Slate (#F1F5F9) for containers to define boundaries where shadows are not appropriate.

## Shapes

The design system uses a **Rounded** shape language to appear approachable and modern. 

- **Standard Elements:** 0.5rem (8px) radius for buttons and input fields.
- **Large Containers:** 1rem (16px) radius for cards and modal sheets.
- **Floating Actions:** 1.5rem (24px) or full pill-shape for high-visibility navigation buttons.

## Components

- **Buttons:** Primary buttons use a solid Indigo fill with white text. Secondary buttons use a Muted Slate background with Deep Charcoal text. High-emphasis actions should use a subtle inner-glow effect to enhance the "premium" feel.
- **Cards:** Cards should be white or translucent with a 1px Slate border. They are the primary vehicle for transit route information.
- **Inputs:** Input fields use the Soft Grey surface variant with a 1px border that shifts to Indigo on focus. 
- **Chips/Status:** Use low-saturation background tints (e.g., light green for "On Time") with high-saturation text to maintain the calm aesthetic while communicating urgency.
- **Transit-Specific Components:** 
    - **Route Badges:** Pill-shaped containers with high-contrast text and a left-aligned colored bar indicating the line color.
    - **Timeline Track:** A thin 2px vertical or horizontal line in Muted Slate with solid Indigo circles for active stops.