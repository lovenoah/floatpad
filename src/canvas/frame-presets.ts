export type FramePreset = { label: string; w: number; h: number };
export type FrameCategory = { name: string; items: FramePreset[] };

export const FRAME_CATEGORIES: FrameCategory[] = [
  {
    name: 'Phone',
    items: [
      { label: 'iPhone 16 & 17 Pro', w: 402, h: 874 },
      { label: 'iPhone 16', w: 393, h: 852 },
      { label: 'iPhone 16 & 17 Pro Max', w: 440, h: 956 },
      { label: 'iPhone 16 Plus', w: 430, h: 932 },
      { label: 'iPhone Air', w: 420, h: 912 },
      { label: 'iPhone 14 & 15 Pro Max', w: 430, h: 932 },
      { label: 'iPhone 14 & 15 Pro', w: 393, h: 852 },
      { label: 'iPhone 13 & 14', w: 390, h: 844 },
      { label: 'iPhone 14 Plus', w: 428, h: 926 },
      { label: 'Android Compact', w: 412, h: 917 },
      { label: 'Android Medium', w: 700, h: 840 },
    ],
  },
  {
    name: 'Tablet',
    items: [
      { label: 'iPad mini 8.3', w: 744, h: 1133 },
      { label: 'Surface Pro 8', w: 1440, h: 960 },
      { label: 'iPad Pro 11"', w: 834, h: 1194 },
      { label: 'iPad Pro 12.9"', w: 1024, h: 1366 },
      { label: 'Android Expanded', w: 1280, h: 800 },
    ],
  },
  {
    name: 'Desktop',
    items: [
      { label: 'MacBook Air', w: 1280, h: 832 },
      { label: 'MacBook Pro 14"', w: 1512, h: 982 },
      { label: 'MacBook Pro 16"', w: 1728, h: 1117 },
      { label: 'Desktop', w: 1440, h: 1024 },
      { label: 'Wireframes', w: 1440, h: 1024 },
      { label: 'TV', w: 1280, h: 720 },
    ],
  },
  {
    name: 'Presentation',
    items: [
      { label: 'Slide 16:9', w: 1920, h: 1080 },
      { label: 'Slide 4:3', w: 1024, h: 768 },
    ],
  },
  {
    name: 'Watch',
    items: [
      { label: 'Apple Watch Series 10 42mm', w: 187, h: 223 },
      { label: 'Apple Watch Series 10 46mm', w: 208, h: 248 },
      { label: 'Apple Watch 41mm', w: 176, h: 215 },
      { label: 'Apple Watch 45mm', w: 198, h: 242 },
      { label: 'Apple Watch 44mm', w: 184, h: 224 },
      { label: 'Apple Watch 40mm', w: 162, h: 197 },
    ],
  },
  {
    name: 'Paper',
    items: [
      { label: 'A4', w: 595, h: 842 },
      { label: 'A5', w: 420, h: 595 },
      { label: 'A6', w: 297, h: 420 },
      { label: 'Letter', w: 612, h: 792 },
      { label: 'Tabloid', w: 792, h: 1224 },
    ],
  },
  {
    name: 'Social media',
    items: [
      { label: 'Twitter post', w: 1200, h: 675 },
      { label: 'Twitter header', w: 1500, h: 500 },
      { label: 'Facebook post', w: 1200, h: 630 },
      { label: 'Facebook cover', w: 820, h: 312 },
      { label: 'Instagram post', w: 1080, h: 1350 },
      { label: 'Instagram story', w: 1080, h: 1920 },
      { label: 'Dribbble shot', w: 400, h: 300 },
      { label: 'Dribbble shot HD', w: 800, h: 600 },
      { label: 'LinkedIn cover', w: 1584, h: 396 },
    ],
  },
];
