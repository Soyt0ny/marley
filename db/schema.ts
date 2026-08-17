/**
 * Database schema.
 *
 * Zone geometry and constraints are stored as JSONB typed against `lib/schema/zone.ts`, which
 * is the single source of truth for their shape. The database enforces relationships and
 * enums; the Zod schemas enforce the fabrication rules before anything is written.
 */

import { relations } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import {
  BUCKLE_SHAPES,
  ZONE_TYPES,
  type ZoneConstraints,
  type ZoneGeometry,
} from '@/lib/schema/zone'

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const buckleShapeEnum = pgEnum('buckle_shape', BUCKLE_SHAPES)
export const zoneTypeEnum = pgEnum('zone_type', ZONE_TYPES)

export const templateStatusEnum = pgEnum('template_status', [
  'draft',
  'published',
  'archived',
])

export const designStatusEnum = pgEnum('design_status', ['draft', 'submitted'])

export const proposalStatusEnum = pgEnum('proposal_status', [
  'pending',
  'completed',
  'failed',
])

/** Quality tier requested from the image provider. Exploration runs cheap, the pick runs finer. */
export const proposalQualityEnum = pgEnum('proposal_quality', ['low', 'medium', 'high'])

/**
 * Order lifecycle. Payment is authorized at submission and only captured once Marley approves,
 * so a rejected order never charges the customer.
 */
export const orderStatusEnum = pgEnum('order_status', [
  'pending_payment',
  'authorized_pending_review',
  'under_review',
  'changes_requested',
  'approved',
  'in_production',
  'shipped',
  'rejected',
  'cancelled',
])

export const paymentKindEnum = pgEnum('payment_kind', [
  'authorization',
  'capture',
  'additional_charge',
  'refund',
])

export const paymentStatusEnum = pgEnum('payment_status', [
  'pending',
  'succeeded',
  'failed',
  'canceled',
])

// ---------------------------------------------------------------------------
// Catalog: templates and their zones
// ---------------------------------------------------------------------------

export const templates = pgTable(
  'templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    shapeType: buckleShapeEnum('shape_type').notNull(),
    /** Blank buckle photo the customizer draws on top of, for the realistic preview. */
    baseArtworkUrl: text('base_artwork_url'),
    /**
     * Black-outline version of the same blank, used for the proof Marley approves and works
     * from. Falls back to the shape silhouette when absent.
     */
    lineArtUrl: text('line_art_url'),
    /** Canonical coordinate space every zone geometry on this template refers to. */
    baseArtworkWidth: integer('base_artwork_width').notNull(),
    baseArtworkHeight: integer('base_artwork_height').notNull(),
    basePriceCents: integer('base_price_cents').notNull(),
    status: templateStatusEnum('status').notNull().default('draft'),
    ...timestamps,
  },
  (table) => [uniqueIndex('templates_slug_idx').on(table.slug)],
)

export const zones = pgTable(
  'zones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    templateId: uuid('template_id')
      .notNull()
      .references(() => templates.id, { onDelete: 'cascade' }),
    zoneType: zoneTypeEnum('zone_type').notNull(),
    label: text('label').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    isRequired: boolean('is_required').notNull().default(false),
    geometry: jsonb('geometry').$type<ZoneGeometry>().notNull(),
    constraints: jsonb('constraints').$type<ZoneConstraints>().notNull(),
    ...timestamps,
  },
  (table) => [index('zones_template_idx').on(table.templateId, table.sortOrder)],
)

// ---------------------------------------------------------------------------
// Option libraries
//
// Fonts and ornaments are global so Marley curates them once, then enables a subset per zone
// through the join tables. The join tables are the authority on "what may this zone use".
// ---------------------------------------------------------------------------

export const fonts = pgTable('fonts', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  /** CSS family name the canvas measures and draws with. */
  cssFamily: text('css_family').notNull(),
  /** Webfont file, loaded before the canvas renders so text metrics are correct. */
  fileUrl: text('file_url'),
  /** Some display faces distort badly on a tight arc; those are flagged unusable on curves. */
  supportsCurve: boolean('supports_curve').notNull().default(true),
  isActive: boolean('is_active').notNull().default(true),
  ...timestamps,
})

export const zoneFontOptions = pgTable(
  'zone_font_options',
  {
    zoneId: uuid('zone_id')
      .notNull()
      .references(() => zones.id, { onDelete: 'cascade' }),
    fontId: uuid('font_id')
      .notNull()
      .references(() => fonts.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.zoneId, table.fontId] })],
)

export const ornamentOptions = pgTable('ornament_options', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  thumbnailUrl: text('thumbnail_url'),
  /** Overlay art composited into a corner slot. */
  assetUrl: text('asset_url'),
  isActive: boolean('is_active').notNull().default(true),
  ...timestamps,
})

export const zoneOrnamentOptions = pgTable(
  'zone_ornament_options',
  {
    zoneId: uuid('zone_id')
      .notNull()
      .references(() => zones.id, { onDelete: 'cascade' }),
    ornamentOptionId: uuid('ornament_option_id')
      .notNull()
      .references(() => ornamentOptions.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.zoneId, table.ornamentOptionId] })],
)

// ---------------------------------------------------------------------------
// Customer designs
// ---------------------------------------------------------------------------

export const designs = pgTable(
  'designs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    templateId: uuid('template_id')
      .notNull()
      .references(() => templates.id, { onDelete: 'restrict' }),
    customerEmail: text('customer_email'),
    status: designStatusEnum('status').notNull().default('draft'),
    /**
     * Generation batches spent inside the current daily window. Counted here rather than
     * derived from proposals so a failed batch still costs its slot and cannot be farmed for
     * free retries, and so the allowance can be claimed atomically.
     */
    aiGenerationCount: integer('ai_generation_count').notNull().default(0),
    /** Start of the rolling window the count belongs to; older than a day and it resets. */
    aiGenerationWindowStartedAt: timestamp('ai_generation_window_started_at', {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    ...timestamps,
  },
  (table) => [index('designs_template_idx').on(table.templateId)],
)

export const aiImageProposals = pgTable(
  'ai_image_proposals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    designId: uuid('design_id')
      .notNull()
      .references(() => designs.id, { onDelete: 'cascade' }),
    zoneId: uuid('zone_id')
      .notNull()
      .references(() => zones.id, { onDelete: 'cascade' }),
    /** What the customer typed, kept verbatim so Marley can see the intent during review. */
    promptUserText: text('prompt_user_text').notNull(),
    /** After the engraving style wrapper is applied, for reproducing a generation later. */
    promptFinalText: text('prompt_final_text').notNull(),
    provider: text('provider').notNull(),
    quality: proposalQualityEnum('quality').notNull(),
    /** Re-hosted on our own storage — provider URLs expire. */
    imageUrl: text('image_url'),
    status: proposalStatusEnum('status').notNull().default('pending'),
    ...timestamps,
  },
  (table) => [index('ai_proposals_design_idx').on(table.designId, table.zoneId)],
)

export const designZoneValues = pgTable(
  'design_zone_values',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    designId: uuid('design_id')
      .notNull()
      .references(() => designs.id, { onDelete: 'cascade' }),
    zoneId: uuid('zone_id')
      .notNull()
      .references(() => zones.id, { onDelete: 'cascade' }),
    // Text zones
    textValue: text('text_value'),
    fontId: uuid('font_id').references(() => fonts.id, { onDelete: 'restrict' }),
    fontSizePx: integer('font_size_px'),
    // Center image zone
    selectedProposalId: uuid('selected_proposal_id').references(() => aiImageProposals.id, {
      onDelete: 'set null',
    }),
    // Corner ornament zone
    selectedOrnamentOptionId: uuid('selected_ornament_option_id').references(
      () => ornamentOptions.id,
      { onDelete: 'restrict' },
    ),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('design_zone_values_unique_idx').on(table.designId, table.zoneId),
  ],
)

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    designId: uuid('design_id')
      .notNull()
      .references(() => designs.id, { onDelete: 'restrict' }),
    /** Human-friendly code the customer quotes when tracking without an account. */
    orderCode: text('order_code').notNull(),
    customerEmail: text('customer_email').notNull(),
    customerName: text('customer_name').notNull(),
    shippingAddress: jsonb('shipping_address'),
    status: orderStatusEnum('status').notNull().default('pending_payment'),
    /**
     * The template and zone configuration as it stood at submission. Editing a template later
     * must not change what an already-placed order means, so the proof stays reproducible.
     */
    templateSnapshot: jsonb('template_snapshot'),
    priceAtSubmissionCents: integer('price_at_submission_cents').notNull(),
    /** Set when Marley confirms or adjusts the total during review; captured amount. */
    priceFinalCents: integer('price_final_cents'),
    stripePaymentIntentId: text('stripe_payment_intent_id'),
    stripeCustomerId: text('stripe_customer_id'),
    /** Internal, never shown to the customer. */
    adminNotes: text('admin_notes'),
    /** Shown to the customer when changes are requested or the order is rejected. */
    customerFacingNote: text('customer_facing_note'),
    proofImageUrl: text('proof_image_url'),
    /** Rounds of requested changes so far, capped to avoid endless back-and-forth. */
    revisionCount: integer('revision_count').notNull().default(0),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('orders_code_idx').on(table.orderCode),
    uniqueIndex('orders_design_idx').on(table.designId),
    index('orders_status_idx').on(table.status),
  ],
)

/** Append-only audit trail. Every status change writes one row, in the same transaction. */
export const orderStatusHistory = pgTable(
  'order_status_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    fromStatus: orderStatusEnum('from_status'),
    toStatus: orderStatusEnum('to_status').notNull(),
    note: text('note'),
    /** 'system', 'stripe_webhook', or 'admin:<email>'. */
    changedBy: text('changed_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('order_history_order_idx').on(table.orderId, table.createdAt)],
)

export const orderPayments = pgTable(
  'order_payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    kind: paymentKindEnum('kind').notNull(),
    amountCents: integer('amount_cents').notNull(),
    /** Stripe PaymentIntent or Refund id. */
    stripeObjectId: text('stripe_object_id'),
    status: paymentStatusEnum('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('order_payments_order_idx').on(table.orderId)],
)

// ---------------------------------------------------------------------------
// Admin access
//
// Only Marley (and any staff she adds) signs in. Customers never get an account; they track
// orders with an emailed order code instead.
// ---------------------------------------------------------------------------

export const adminUsers = pgTable(
  'admin_users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex('admin_users_email_idx').on(table.email)],
)

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adminUserId: uuid('admin_user_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    /** Only the hash is stored, so a database leak cannot be replayed as a reset link. */
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('password_reset_token_idx').on(table.tokenHash)],
)

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const templatesRelations = relations(templates, ({ many }) => ({
  zones: many(zones),
  designs: many(designs),
}))

export const zonesRelations = relations(zones, ({ one, many }) => ({
  template: one(templates, {
    fields: [zones.templateId],
    references: [templates.id],
  }),
  fontOptions: many(zoneFontOptions),
  ornamentOptions: many(zoneOrnamentOptions),
  values: many(designZoneValues),
}))

export const zoneFontOptionsRelations = relations(zoneFontOptions, ({ one }) => ({
  zone: one(zones, { fields: [zoneFontOptions.zoneId], references: [zones.id] }),
  font: one(fonts, { fields: [zoneFontOptions.fontId], references: [fonts.id] }),
}))

export const zoneOrnamentOptionsRelations = relations(zoneOrnamentOptions, ({ one }) => ({
  zone: one(zones, { fields: [zoneOrnamentOptions.zoneId], references: [zones.id] }),
  ornamentOption: one(ornamentOptions, {
    fields: [zoneOrnamentOptions.ornamentOptionId],
    references: [ornamentOptions.id],
  }),
}))

export const designsRelations = relations(designs, ({ one, many }) => ({
  template: one(templates, {
    fields: [designs.templateId],
    references: [templates.id],
  }),
  zoneValues: many(designZoneValues),
  proposals: many(aiImageProposals),
  order: one(orders),
}))

export const designZoneValuesRelations = relations(designZoneValues, ({ one }) => ({
  design: one(designs, {
    fields: [designZoneValues.designId],
    references: [designs.id],
  }),
  zone: one(zones, { fields: [designZoneValues.zoneId], references: [zones.id] }),
  font: one(fonts, { fields: [designZoneValues.fontId], references: [fonts.id] }),
  selectedProposal: one(aiImageProposals, {
    fields: [designZoneValues.selectedProposalId],
    references: [aiImageProposals.id],
  }),
  selectedOrnamentOption: one(ornamentOptions, {
    fields: [designZoneValues.selectedOrnamentOptionId],
    references: [ornamentOptions.id],
  }),
}))

export const aiImageProposalsRelations = relations(aiImageProposals, ({ one }) => ({
  design: one(designs, {
    fields: [aiImageProposals.designId],
    references: [designs.id],
  }),
  zone: one(zones, { fields: [aiImageProposals.zoneId], references: [zones.id] }),
}))

export const ordersRelations = relations(orders, ({ one, many }) => ({
  design: one(designs, { fields: [orders.designId], references: [designs.id] }),
  history: many(orderStatusHistory),
  payments: many(orderPayments),
}))

export const orderStatusHistoryRelations = relations(orderStatusHistory, ({ one }) => ({
  order: one(orders, {
    fields: [orderStatusHistory.orderId],
    references: [orders.id],
  }),
}))

export const orderPaymentsRelations = relations(orderPayments, ({ one }) => ({
  order: one(orders, { fields: [orderPayments.orderId], references: [orders.id] }),
}))

export const adminUsersRelations = relations(adminUsers, ({ many }) => ({
  passwordResetTokens: many(passwordResetTokens),
}))

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  adminUser: one(adminUsers, {
    fields: [passwordResetTokens.adminUserId],
    references: [adminUsers.id],
  }),
}))
