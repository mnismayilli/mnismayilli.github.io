import { defineCollection, z } from 'astro:content';

const pages = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    seo: z.object({
      title: z.string(),
      description: z.string(),
      image: z.object({
        src: z.string(),
        alt: z.string().optional(),
      }).optional(),
    }),
  }),
});

const lectures = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    publishDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    course: z.string().optional(),
    tags: z.array(z.string()).default([]),
    isFeatured: z.boolean().default(false),
    seo: z.object({
      title: z.string().optional(),
      description: z.string().optional(),
      image: z.object({
        src: z.string(),
        alt: z.string().optional(),
      }).optional(),
    }).optional(),
  }),
});

export const collections = {
  pages,
  lectures,
};
