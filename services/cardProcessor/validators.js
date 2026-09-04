const { z } = require('zod');

const cropSchema = z.object({
  x: z.coerce.number(),
  y: z.coerce.number(),
  width: z.coerce.number().positive('Crop width must be positive'),
  height: z.coerce.number().positive('Crop height must be positive'),
});

const sourceSchema = z.object({
  pageNumber: z.coerce.number().int().positive('Page number must be a positive integer').default(1),
  pageWidth: z.coerce.number().positive('Page width must be positive').optional(),
  pageHeight: z.coerce.number().positive('Page height must be positive').optional(),
  pagesCount: z.coerce.number().int().positive().optional(),
});

const outputSchema = z.object({
  width: z.coerce.number().positive('Output width must be positive'),
  height: z.coerce.number().positive('Output height must be positive'),
  unit: z.enum(['mm', 'inch']).default('mm'),
  dpi: z.coerce.number().int().positive('DPI must be positive').default(300),
});

const cropBackSchema = z.object({
  x: z.coerce.number().optional().default(0),
  y: z.coerce.number().optional().default(0),
  width: z.coerce.number().optional().default(0),
  height: z.coerce.number().optional().default(0),
  pageNumber: z.coerce.number().int().positive().optional().default(1),
});

const normalizedCropSchema = z.object({
  x: z.coerce.number(),
  y: z.coerce.number(),
  width: z.coerce.number().positive(),
  height: z.coerce.number().positive(),
});

const createProfileSchema = z.object({
  name: z.string().min(1, 'Profile name is required').trim(),
  code: z.string().min(1, 'Profile code is required').trim(),
  description: z.string().min(1, 'Description is required').trim(),
  price: z.coerce.number().min(0, 'Price cannot be negative').optional().default(0),
  status: z.enum(['draft', 'active', 'inactive']).optional().default('draft'),
  layoutMode: z.enum(['single', 'double']).optional().default('single'),
  cropMappingMode: z.enum(['fixed', 'normalized']).optional().default('normalized'),
  source: sourceSchema.optional(),
  crop: cropSchema,
  cropBack: cropBackSchema.optional(),
  normalizedCrop: normalizedCropSchema.optional(),
  normalizedCropBack: normalizedCropSchema.optional(),
  output: outputSchema,
});

const updateProfileSchema = z.object({
  name: z.string().min(1).trim().optional(),
  code: z.string().min(1).trim().optional(),
  description: z.string().min(1).trim().optional(),
  price: z.coerce.number().min(0, 'Price cannot be negative').optional(),
  status: z.enum(['draft', 'active', 'inactive']).optional(),
  layoutMode: z.enum(['single', 'double']).optional(),
  cropMappingMode: z.enum(['fixed', 'normalized']).optional(),
  source: sourceSchema.partial().optional(),
  crop: cropSchema.partial().optional(),
  cropBack: cropBackSchema.partial().optional(),
  normalizedCrop: normalizedCropSchema.partial().optional(),
  normalizedCropBack: normalizedCropSchema.partial().optional(),
  output: outputSchema.partial().optional(),
});

module.exports = {
  createProfileSchema,
  updateProfileSchema,
};
