// All drizzle-orm imports are dynamic to avoid ESM/CJS interop issues with tsx
import postgres from "postgres";
import { InsertUser, users, equipment, InsertEquipment, maintenanceTasks, InsertMaintenanceTask, servicePlans, InsertServicePlan, auditLogs, InsertAuditLog, personnel, customers, jobs, InsertJob, waitlist, InsertWaitlist } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: any = null;

// Get database connection string from environment variables
function getDatabaseUrl(): string | null {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    return databaseUrl;
  }

  // Fallback to component-based construction
  const password = process.env.DB_PASSWORD;
  const host = process.env.DB_HOST;
  const port = process.env.DB_PORT || '5432';
  const database = process.env.DB_NAME || 'postgres';
  const user = process.env.DB_USER || 'postgres';

  if (password && host) {
    return `postgresql://${user}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
  }

  return null;
}

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  const connectionString = getDatabaseUrl();
  
  if (!_db && connectionString) {
    try {
      const { drizzle } = await import("drizzle-orm/postgres-js");
      const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1') || connectionString.includes('@db:') || connectionString.includes('@db/');
      const client = postgres(connectionString, {
        ssl: isLocal ? false : { rejectUnauthorized: false },
        max: 10,
        idle_timeout: 20, // 20 seconds
        max_lifetime: 60 * 30,
      });
      _db = drizzle(client);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  const { or } = await import("drizzle-orm");

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }
    
    // Set userRole for owner to 'admin' for permissions system
    if (user.openId === ENV.ownerOpenId) {
      values.userRole = 'admin';
      updateSet.userRole = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    // PostgreSQL upsert syntax
    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const { eq } = await import("drizzle-orm");
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Organization helpers
export async function getOrCreateUserOrganization(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { organizations } = await import("../drizzle/schema");
  const { eq, or } = await import("drizzle-orm");
  
  // Check if user already has an organization
  const existing = await db.select().from(organizations).where(eq(organizations.ownerId, userId)).limit(1);
  
  if (existing.length > 0) {
    return existing[0];
  }
  
  // Create new organization for user with active enterprise defaults
  const result = await db.insert(organizations).values({
    name: `Organization ${userId}`,
    ownerId: userId,
    subscriptionStatus: "active",
    subscriptionPlan: "enterprise",
    aiCreditsTotal: 999999,
  }).returning();

  // Seed default job statuses for the new org
  await ensureDefaultJobStatuses(result[0].id);

  return result[0];
}

export async function updateOrganization(orgId: number, data: Partial<{
  name: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string;
  email: string;
  website: string;
  notes: string;
  googleMapsApiKey: string;
}>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { organizations } = await import("../drizzle/schema");
  const { eq, or } = await import("drizzle-orm");
  
  const result = await db.update(organizations)
    .set(data)
    .where(eq(organizations.id, orgId))
    .returning();
  
  return result[0];
}

export async function getOrganizationById(orgId: number) {
  const db = await getDb();
  if (!db) return null;
  
  const { organizations } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  const result = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

// Customer helpers
export async function getCustomersByOrgId(orgId: number) {
  const db = await getDb();
  if (!db) return [];
  
  const { customers } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  return await db.select().from(customers).where(eq(customers.orgId, orgId));
}

export async function createCustomer(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { customers } = await import("../drizzle/schema");
  const { or } = await import("drizzle-orm");
  const result = await db.insert(customers).values(data).returning();
  return result[0];
}
export async function updateCustomer(id: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { customers } = await import("../drizzle/schema");
  const { eq, or } = await import("drizzle-orm");
  const result = await db.update(customers).set(data).where(eq(customers.id, id)).returning();
  return result[0];
}

export async function deleteCustomer(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { customers } = await import("../drizzle/schema");
  const { eq, or } = await import("drizzle-orm");
  await db.delete(customers).where(eq(customers.id, id));
}

// Job helpers
export async function getJobsByOrgId(orgId: number, params?: {
  page?: number;
  pageSize?: number;
}) {
  const db = await getDb();
  if (!db) return { data: [], total: 0, page: 1, pageSize: 25, totalPages: 1 };
  
  const { jobs: jobs, customers, personnel } = await import("../drizzle/schema");
  const { eq, sql } = await import("drizzle-orm");
  
  const page = Math.max(1, params?.page || 1);
  const pageSize = Math.min(100, Math.max(1, params?.pageSize || 25));
  const offset = (page - 1) * pageSize;
  
  // Get total count
  const totalResult = await db
    .select({ count: sql`count(*)` })
    .from(jobs)
    .where(eq(jobs.orgId, orgId));
  
  const total = Number(totalResult[0]?.count || 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  
  // Join jobs with customers and personnel to get display names
  const result = await db
    .select({
      id: jobs.id,
      orgId: jobs.orgId,
      customerId: jobs.customerId,
      personnelId: jobs.assignedPersonnelId,
      equipmentId: jobs.equipmentId,
      productId: jobs.productId,
      title: jobs.title,
      description: jobs.description,
      jobType: jobs.jobType,
      statusId: jobs.statusId,
      priority: jobs.priority,
      location: jobs.locationAddress,
      latitude: jobs.locationLat,
      longitude: jobs.locationLng,
      scheduledStart: jobs.scheduledStart,
      scheduledEnd: jobs.scheduledEnd,
      actualStart: jobs.actualStart,
      actualEnd: jobs.actualEnd,
      notes: jobs.notes,
      // Agricultural details
      state: jobs.state,
      commodityCrop: jobs.commodityCrop,
      targetPest: jobs.targetPest,
      epaNumber: jobs.epaNumber,
      applicationRate: jobs.applicationRate,
      applicationMethod: jobs.applicationMethod,
      chemicalProduct: jobs.chemicalProduct,
      reEntryInterval: jobs.reEntryInterval,
      preharvestInterval: jobs.preharvestInterval,
      maxApplicationsPerSeason: jobs.maxApplicationsPerSeason,
      maxRatePerSeason: jobs.maxRatePerSeason,
      methodsAllowed: jobs.methodsAllowed,
      rate: jobs.rate,
      diluentAerial: jobs.diluentAerial,
      diluentGround: jobs.diluentGround,
      diluentChemigation: jobs.diluentChemigation,
      genericConditions: jobs.genericConditions,
      acres: jobs.acres,
      carrierVolume: jobs.carrierVolume,
      carrierUnit: jobs.carrierUnit,
      numLoads: jobs.numLoads,
      zonesToTreat: jobs.zonesToTreat,
      weatherConditions: jobs.weatherConditions,
      temperatureF: jobs.temperatureF,
      windSpeedMph: jobs.windSpeedMph,
      windDirection: jobs.windDirection,
      createdAt: jobs.createdAt,
      updatedAt: jobs.updatedAt,
      // Customer name from customers table
      customerName: customers.name,
      // Personnel name from personnel table
      personnelName: personnel.name,
    })
    .from(jobs)
    .leftJoin(customers, eq(jobs.customerId, customers.id))
    .leftJoin(personnel, eq(jobs.assignedPersonnelId, personnel.id))
    .where(eq(jobs.orgId, orgId))
    .limit(pageSize)
    .offset(offset);
  
  return {
    data: result,
    total,
    page,
    pageSize,
    totalPages,
  };
}
export async function createJob(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Use raw SQL to avoid Drizzle trying to insert into columns that don't exist
  const { or, sql } = await import("drizzle-orm");
  
  const result = await db.execute(sql`
    INSERT INTO jobs_v2 (
      org_id,
      title,
      description,
      job_type,
      priority,
      status,
      customer_id,
      personnel_id,
      equipment_id,
      product_id,
      location,
      latitude,
      longitude,
      scheduled_start,
      scheduled_end,
      created_at,
      updated_at
    ) VALUES (
      ${data.orgId},
      ${data.title},
      ${data.description || null},
      ${data.jobType || null},
      ${data.priority || 'medium'},
      ${data.status || 'pending'},
      ${data.customerId || null},
      ${data.personnelId || null},
      ${data.equipmentId || null},
      ${data.productId || null},
      ${data.location || null},
      ${data.locationLat || null},
      ${data.locationLng || null},
      ${data.scheduledStart || null},
      ${data.scheduledEnd || null},
      NOW(),
      NOW()
    )
    RETURNING *
  `);
  
  return result[0];
}

export async function getJobById(id: number) {
  const db = await getDb();
  if (!db) return null;
  
  const { jobs } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  const result = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
  return result[0] || null;
}
export async function updateJob(id: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { jobs } = await import("../drizzle/schema");
  const { eq, or } = await import("drizzle-orm");
  const result = await db.update(jobs).set(data).where(eq(jobs.id, id)).returning();
  return result[0];
}
export async function deleteJob(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { jobs } = await import("../drizzle/schema");
  const { eq, or } = await import("drizzle-orm");
  await db.delete(jobs).where(eq(jobs.id, id));
}

export async function getJobStatusesByOrgId(orgId: number) {
  const db = await getDb();
  if (!db) return [];

  const { jobStatuses } = await import("../drizzle/schema");
  const { asc, eq } = await import("drizzle-orm");
  return await db.select().from(jobStatuses).where(eq(jobStatuses.orgId, orgId)).orderBy(asc(jobStatuses.displayOrder));
}

export async function ensureDefaultJobStatuses(orgId: number) {
  const db = await getDb();
  if (!db) return;

  const { jobStatuses } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");

  const existing = await db.select().from(jobStatuses).where(eq(jobStatuses.orgId, orgId)).limit(1);
  if (existing.length > 0) return;

  const defaults = [
    { orgId, name: "Pending",     color: "#f59e0b", displayOrder: 0, category: "pending",   isDefault: true },
    { orgId, name: "In Progress", color: "#3b82f6", displayOrder: 1, category: "active",    isDefault: false },
    { orgId, name: "Completed",   color: "#22c55e", displayOrder: 2, category: "completed", isDefault: false },
    { orgId, name: "Cancelled",   color: "#ef4444", displayOrder: 3, category: "completed", isDefault: false },
  ];

  await db.insert(jobStatuses).values(defaults);
}

export async function createJobStatus(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { jobStatuses } = await import("../drizzle/schema");
  const { or } = await import("drizzle-orm");
  const result = await db.insert(jobStatuses).values(data).returning();
  return result[0];
}
export async function updateJobStatus(id: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { jobStatuses } = await import("../drizzle/schema");
  const { eq, or } = await import("drizzle-orm");
  const result = await db.update(jobStatuses).set(data).where(eq(jobStatuses.id, id)).returning();
  return result[0];
}
export async function deleteJobStatus(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { jobStatuses } = await import("../drizzle/schema");
  const { eq, or } = await import("drizzle-orm");
  await db.delete(jobStatuses).where(eq(jobStatuses.id, id));
}
export async function reorderJobStatuses(statusIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { jobStatuses } = await import("../drizzle/schema");
  const { eq, or } = await import("drizzle-orm");
  
  // Update each status with its new display order
  for (let i = 0; i < statusIds.length; i++) {
    await db.update(jobStatuses)
      .set({ displayOrder: i })
      .where(eq(jobStatuses.id, statusIds[i]));
  }
}
export async function getDefaultJobStatus(orgId: number) {
  const db = await getDb();
  if (!db) return null;
  
  const { jobStatuses } = await import("../drizzle/schema");
  const { and, eq } = await import("drizzle-orm");
  const result = await db.select().from(jobStatuses).where(
    and(eq(jobStatuses.orgId, orgId), eq(jobStatuses.isDefault, true))
  ).limit(1);
  return result[0] || null;
}

// Job Status History helpers
export async function createJobStatusHistory(data: {
  jobId: number;
  fromStatusId: number | null;
  toStatusId: number;
  changedByUserId: number;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { jobStatusHistory } = await import("../drizzle/schema");
  const { or } = await import("drizzle-orm");
  const result = await db.insert(jobStatusHistory).values(data).returning();
  return result[0];
}
export async function getJobStatusHistory(jobId: number) {
  const db = await getDb();
  if (!db) return [];
  
  const { jobStatusHistory, jobStatuses, users } = await import("../drizzle/schema");
  const { desc, eq } = await import("drizzle-orm");
  
  // Join with job_statuses and users to get status names and user names
  const result = await db
    .select({
      id: jobStatusHistory.id,
      jobId: jobStatusHistory.jobId,
      fromStatusId: jobStatusHistory.fromStatusId,
      toStatusId: jobStatusHistory.toStatusId,
      changedByUserId: jobStatusHistory.changedByUserId,
      notes: jobStatusHistory.notes,
      createdAt: jobStatusHistory.createdAt,
      fromStatusName: jobStatuses.name,
      toStatusName: jobStatuses.name,
      changedByUserName: users.name,
    })
    .from(jobStatusHistory)
    .leftJoin(jobStatuses, eq(jobStatusHistory.fromStatusId, jobStatuses.id))
    .leftJoin(jobStatuses, eq(jobStatusHistory.toStatusId, jobStatuses.id))
    .leftJoin(users, eq(jobStatusHistory.changedByUserId, users.id))
    .where(eq(jobStatusHistory.jobId, jobId))
    .orderBy(desc(jobStatusHistory.createdAt));
    
  return result;
}

// Personnel helpers
export async function getPersonnelByOrgId(orgId: number) {
  const db = await getDb();
  if (!db) return [];
  
  const { personnel } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  return await db.select().from(personnel).where(eq(personnel.orgId, orgId));
}
export async function createPersonnel(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { personnel } = await import("../drizzle/schema");
  const { or } = await import("drizzle-orm");
  const result = await db.insert(personnel).values(data).returning();
  return result[0];
}
export async function updatePersonnel(id: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { personnel } = await import("../drizzle/schema");
  const { eq, or } = await import("drizzle-orm");
  const result = await db.update(personnel).set(data).where(eq(personnel.id, id)).returning();
  return result[0];
}
export async function deletePersonnel(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { personnel } = await import("../drizzle/schema");
  const { eq, or } = await import("drizzle-orm");
  await db.delete(personnel).where(eq(personnel.id, id));
}

export async function getProductsByOrgId(orgId: number) {
  const db = await getDb();
  if (!db) return [];

  const { productsComplete } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  return await db.select().from(productsComplete).where(eq(productsComplete.orgId, orgId));
}

export async function getConversationsByOrgId(orgId: number) {
  const db = await getDb();
  if (!db) return [];
  
  const { aiConversations } = await import("../drizzle/schema");
  const { desc, eq } = await import("drizzle-orm");
  return await db.select().from(aiConversations).where(eq(aiConversations.orgId, orgId)).orderBy(desc(aiConversations.createdAt));
}

export async function createConversation(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { aiConversations } = await import("../drizzle/schema");
  const { or } = await import("drizzle-orm");
  const result = await db.insert(aiConversations).values(data).returning();
  return result[0];
}
export async function deleteConversation(conversationId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { aiConversations, aiMessages } = await import("../drizzle/schema");
  const { eq, or } = await import("drizzle-orm");
  
  // Delete all messages in the conversation first
  await db.delete(aiMessages).where(eq(aiMessages.conversationId, conversationId));
  
  // Delete the conversation
  await db.delete(aiConversations).where(eq(aiConversations.id, conversationId));
}

export async function getMessagesByConversationId(conversationId: number) {
  const db = await getDb();
  if (!db) return [];
  
  const { aiMessages } = await import("../drizzle/schema");
  const { asc, eq } = await import("drizzle-orm");
  return await db.select().from(aiMessages).where(eq(aiMessages.conversationId, conversationId)).orderBy(asc(aiMessages.createdAt));
}

export async function createMessage(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { aiMessages } = await import("../drizzle/schema");
  const { or } = await import("drizzle-orm");
  const result = await db.insert(aiMessages).values(data).returning();
  return result[0];
}

export async function getMapsByOrgId(orgId: number) {
  const db = await getDb();
  if (!db) return [];
  
  const { maps } = await import("../drizzle/schema");
  const { desc, eq } = await import("drizzle-orm");
  return await db.select().from(maps).where(eq(maps.orgId, orgId)).orderBy(desc(maps.createdAt));
}

export async function createMap(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { maps } = await import("../drizzle/schema");
  const { or } = await import("drizzle-orm");
  const result = await db.insert(maps).values(data).returning();
  return result[0];
}
export async function deleteMap(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { maps } = await import("../drizzle/schema");
  const { eq, or } = await import("drizzle-orm");
  await db.delete(maps).where(eq(maps.id, id));
}

export async function getSitesByOrgId(orgId: number) {
  const db = await getDb();
  if (!db) return [];
  
  const { sites, customers } = await import("../drizzle/schema");
  const { desc, eq } = await import("drizzle-orm");
  
  // Join with customers to get customer name
  const result = await db
    .select({
      id: sites.id,
      orgId: sites.orgId,
      customerId: sites.customerId,
      customerName: customers.name,
      name: sites.name,
      siteType: sites.siteType,
      address: sites.address,
      city: sites.city,
      state: sites.state,
      zipCode: sites.zipCode,
      polygon: sites.polygon,
      centerLat: sites.centerLat,
      centerLng: sites.centerLng,
      acres: sites.acres,
      crop: sites.crop,
      variety: sites.variety,
      growthStage: sites.growthStage,
      sensitiveAreas: sites.sensitiveAreas,
      propertyType: sites.propertyType,
      units: sites.units,
      notes: sites.notes,
      createdAt: sites.createdAt,
      updatedAt: sites.updatedAt,
    })
    .from(sites)
    .leftJoin(customers, eq(sites.customerId, customers.id))
    .where(eq(sites.orgId, orgId))
    .orderBy(desc(sites.createdAt));
  
  return result;
}

export async function getSiteById(id: number) {
  const db = await getDb();
  if (!db) return null;
  
  const { sites, customers } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  
  const result = await db
    .select({
      id: sites.id,
      orgId: sites.orgId,
      customerId: sites.customerId,
      customerName: customers.name,
      name: sites.name,
      siteType: sites.siteType,
      address: sites.address,
      city: sites.city,
      state: sites.state,
      zipCode: sites.zipCode,
      polygon: sites.polygon,
      centerLat: sites.centerLat,
      centerLng: sites.centerLng,
      acres: sites.acres,
      crop: sites.crop,
      variety: sites.variety,
      growthStage: sites.growthStage,
      sensitiveAreas: sites.sensitiveAreas,
      propertyType: sites.propertyType,
      units: sites.units,
      notes: sites.notes,
      createdAt: sites.createdAt,
      updatedAt: sites.updatedAt,
    })
    .from(sites)
    .leftJoin(customers, eq(sites.customerId, customers.id))
    .where(eq(sites.id, id))
    .limit(1);
  
  return result[0] || null;
}
export async function createSite(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { sites } = await import("../drizzle/schema");
  const { or } = await import("drizzle-orm");
  const result = await db.insert(sites).values(data).returning();
  return result[0];
}
export async function updateSite(id: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { sites } = await import("../drizzle/schema");
  const { eq, or } = await import("drizzle-orm");
  const result = await db.update(sites).set(data).where(eq(sites.id, id)).returning();
  return result[0];
}
export async function deleteSite(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { sites } = await import("../drizzle/schema");
  const { eq, or } = await import("drizzle-orm");
  await db.delete(sites).where(eq(sites.id, id));
}


// ============================================
// Integration Procedures
// ============================================
export async function getIntegrationConnections(organizationId: number) {
  const db = await getDb();
  if (!db) return [];
  
  try {
    const { integrationConnections } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
    return await db.select().from(integrationConnections).where(eq(integrationConnections.organizationId, organizationId));
  } catch (error) {
    console.warn('[getIntegrationConnections] Table may not exist yet:', error);
    return [];
  }
}
export async function getIntegrationConnection(organizationId: number, integrationType: string) {
  const db = await getDb();
  if (!db) return null;
  
  try {
    const { integrationConnections } = await import("../drizzle/schema");
    const { and, eq, sql } = await import("drizzle-orm");
    const result = await db.select().from(integrationConnections).where(
      and(
        eq(integrationConnections.organizationId, organizationId),
        sql`${integrationConnections.integrationType} = ${integrationType}`
      )
    ).limit(1);
    return result[0] || null;
  } catch (error) {
    console.warn('[getIntegrationConnection] Table may not exist yet:', error);
    return null;
  }
}

export async function createIntegrationConnection(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { integrationConnections } = await import("../drizzle/schema");
  const { or } = await import("drizzle-orm");
  const result = await db.insert(integrationConnections).values(data).returning();
  return result[0];
}
export async function updateIntegrationConnection(id: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { integrationConnections } = await import("../drizzle/schema");
  const { eq, or } = await import("drizzle-orm");
  const result = await db.update(integrationConnections).set(data).where(eq(integrationConnections.id, id)).returning();
  return result[0];
}
export async function deleteIntegrationConnection(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { integrationConnections } = await import("../drizzle/schema");
  const { eq, or } = await import("drizzle-orm");
  await db.delete(integrationConnections).where(eq(integrationConnections.id, id));
}
export async function createSyncLog(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { integrationSyncLogs } = await import("../drizzle/schema");
  const { or } = await import("drizzle-orm");
  const result = await db.insert(integrationSyncLogs).values(data).returning();
  return result[0];
}
export async function getSyncLogs(connectionId: number, limit: number = 100) {
  const db = await getDb();
  if (!db) return [];
  
  const { integrationSyncLogs } = await import("../drizzle/schema");
  const { desc, eq } = await import("drizzle-orm");
  return await db.select().from(integrationSyncLogs)
    .where(eq(integrationSyncLogs.connectionId, connectionId))
    .orderBy(desc(integrationSyncLogs.syncedAt))
    .limit(limit);
}

export async function getEntityMapping(connectionId: number, entityType: string, ready2sprayId: number) {
  const db = await getDb();
  if (!db) return null;
  
  const { integrationEntityMappings } = await import("../drizzle/schema");
  const { and, eq, sql } = await import("drizzle-orm");
  const result = await db.select().from(integrationEntityMappings).where(
    and(
      eq(integrationEntityMappings.connectionId, connectionId),
      sql`${integrationEntityMappings.entityType} = ${entityType}`,
      eq(integrationEntityMappings.ready2sprayId, ready2sprayId)
    )
  ).limit(1);
  return result[0] || null;
}

export async function createEntityMapping(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { integrationEntityMappings } = await import("../drizzle/schema");
  const { and, eq, or, sql } = await import("drizzle-orm");
  
  // Check if mapping already exists
  const existing = await db.select().from(integrationEntityMappings).where(
    and(
      eq(integrationEntityMappings.connectionId, data.connectionId),
      sql`${integrationEntityMappings.entityType} = ${data.entityType}`,
      eq(integrationEntityMappings.ready2sprayId, data.ready2sprayId)
    )
  ).limit(1);
  
  if (existing.length > 0) {
    // Update existing mapping
    const result = await db.update(integrationEntityMappings)
      .set({ externalId: data.externalId, lastSyncedAt: new Date() })
      .where(eq(integrationEntityMappings.id, existing[0].id))
      .returning();
    return result[0];
  } else {
    // Create new mapping
    const result = await db.insert(integrationEntityMappings).values({
      ...data,
      lastSyncedAt: new Date()
    }).returning();
    return result[0];
  }
}


// ============================================================================
// Equipment Functions
// ============================================================================

export async function getEquipmentByOrgId(orgId: number) {
  const db = await getDb();
  if (!db) return [];
  const { eq } = await import("drizzle-orm");
  
  const result = await db.select().from(equipment).where(eq(equipment.orgId, orgId));
  return result;
}
export async function getEquipmentById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const { eq } = await import("drizzle-orm");
  
  const result = await db.select().from(equipment).where(eq(equipment.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}
export async function createEquipment(data: InsertEquipment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { or } = await import("drizzle-orm");
  
  await db.insert(equipment).values(data);
}
export async function updateEquipment(id: number, data: Partial<InsertEquipment>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { eq, or } = await import("drizzle-orm");
  
  await db.update(equipment).set(data).where(eq(equipment.id, id));
}
export async function deleteEquipment(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { eq, or } = await import("drizzle-orm");
  
  await db.delete(equipment).where(eq(equipment.id, id));
}


// ============================================================================
// Maintenance Tasks
// ============================================================================
export async function getMaintenanceTasksByEquipmentId(equipmentId: number) {
  const db = await getDb();
  if (!db) return [];
  const { eq } = await import("drizzle-orm");
  
  const result = await db
    .select()
    .from(maintenanceTasks)
    .where(eq(maintenanceTasks.equipmentId, equipmentId))
    .orderBy(maintenanceTasks.nextDueDate);
  
  return result;
}
export async function getAllMaintenanceTasks(orgId: number) {
  const db = await getDb();
  if (!db) return [];
  const { sql } = await import("drizzle-orm");
  
  // Get all equipment for this org first
  const orgEquipment = await getEquipmentByOrgId(orgId);
  const equipmentIds = orgEquipment.map(e => e.id);
  
  if (equipmentIds.length === 0) return [];
  
  const result = await db
    .select()
    .from(maintenanceTasks)
    .where(sql`${maintenanceTasks.equipmentId} IN (${sql.join(equipmentIds.map(id => sql`${id}`), sql`, `)})`)
    .orderBy(maintenanceTasks.nextDueDate);
  
  return result;
}
export async function getMaintenanceTaskById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const { eq } = await import("drizzle-orm");
  
  const result = await db
    .select()
    .from(maintenanceTasks)
    .where(eq(maintenanceTasks.id, id))
    .limit(1);
  
  return result[0];
}
export async function createMaintenanceTask(task: InsertMaintenanceTask) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { or } = await import("drizzle-orm");
  
  const result = await db.insert(maintenanceTasks).values(task).returning();
  return result[0];
}
export async function updateMaintenanceTask(id: number, updates: Partial<InsertMaintenanceTask>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { eq, or } = await import("drizzle-orm");
  
  const result = await db
    .update(maintenanceTasks)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(maintenanceTasks.id, id))
    .returning();
  
  return result[0];
}
export async function completeMaintenanceTask(id: number, actualCost?: string, notes?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { eq, or } = await import("drizzle-orm");
  
  const task = await getMaintenanceTaskById(id);
  if (!task) throw new Error("Task not found");
  
  const now = new Date();
  let nextDueDate: Date | null = null;
  
  // Calculate next due date if recurring
  if (task.isRecurring && task.frequencyType && task.frequencyValue) {
    switch (task.frequencyType) {
      case "hours":
        // For hours-based, we'd need equipment hours tracking
        // For now, skip automatic calculation
        break;
      case "days":
        nextDueDate = new Date(now);
        nextDueDate.setDate(nextDueDate.getDate() + task.frequencyValue);
        break;
      case "months":
        nextDueDate = new Date(now);
        nextDueDate.setMonth(nextDueDate.getMonth() + task.frequencyValue);
        break;
    }
  }
  
  const updates: Partial<InsertMaintenanceTask> = {
    status: "completed",
    lastCompletedDate: now,
    nextDueDate: nextDueDate,
    updatedAt: now,
  };
  
  if (actualCost) updates.actualCost = actualCost;
  if (notes) updates.notes = notes;
  
  const result = await db
    .update(maintenanceTasks)
    .set(updates)
    .where(eq(maintenanceTasks.id, id))
    .returning();
  
  return result[0];
}
export async function deleteMaintenanceTask(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { eq, or } = await import("drizzle-orm");
  
  await db.delete(maintenanceTasks).where(eq(maintenanceTasks.id, id));
}


// ============= Service Plans =============
export async function getServicePlansByOrgId(orgId: number) {
  const db = await getDb();
  if (!db) return [];
  const { desc, eq } = await import("drizzle-orm");
  
  const result = await db
    .select()
    .from(servicePlans)
    .where(eq(servicePlans.orgId, orgId))
    .orderBy(desc(servicePlans.createdAt));
  
  return result;
}
export async function getServicePlanById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const { eq } = await import("drizzle-orm");
  
  const result = await db
    .select()
    .from(servicePlans)
    .where(eq(servicePlans.id, id))
    .limit(1);
  
  return result.length > 0 ? result[0] : undefined;
}
export async function createServicePlan(plan: InsertServicePlan) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { or } = await import("drizzle-orm");
  
  const result = await db.insert(servicePlans).values(plan).returning();
  return result[0];
}
export async function updateServicePlan(id: number, plan: Partial<InsertServicePlan>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { eq, or } = await import("drizzle-orm");
  
  const result = await db
    .update(servicePlans)
    .set({ ...plan, updatedAt: new Date() })
    .where(eq(servicePlans.id, id))
    .returning();
  
  return result[0];
}
export async function deleteServicePlan(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { eq, or } = await import("drizzle-orm");
  
  await db.delete(servicePlans).where(eq(servicePlans.id, id));
}

export async function getUsersByOrgId(orgId: number) {
  const db = await getDb();
  if (!db) return [];

  const { organizations } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");

  // Users are associated via org ownership (no join table yet)
  const org = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  if (!org[0]) return [];

  const result = await db.select().from(users).where(eq(users.id, org[0].ownerId));
  return result;
}

export async function createUser(user: { name: string; email: string; userRole: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { or } = await import("drizzle-orm");
  
  // Create a placeholder openId based on email until they sign in
  const placeholderOpenId = `placeholder_${user.email}_${Date.now()}`;
  
  const result = await db.insert(users).values({
    openId: placeholderOpenId,
    name: user.name,
    email: user.email,
    userRole: user.userRole,
    role: 'user',
  }).returning();
  
  return result[0];
}
export async function updateUserRole(userId: number, userRole: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { eq, or } = await import("drizzle-orm");
  
  await db.update(users).set({ userRole }).where(eq(users.id, userId));
}

// ==================== Audit Log Functions ====================
export async function createAuditLog(auditLog: InsertAuditLog) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { or } = await import("drizzle-orm");
  
  const result = await db.insert(auditLogs).values(auditLog).returning();
  return result[0];
}
export async function getAuditLogs(
  orgId: number,
  filters?: {
    userId?: number;
    action?: string;
    entityType?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }
) {
  const db = await getDb();
  if (!db) return [];

  const { and, desc, eq, gte, lte } = await import("drizzle-orm");
  // Build where conditions
  const conditions = [eq(auditLogs.organizationId, orgId)];
  
  if (filters?.userId) {
    conditions.push(eq(auditLogs.userId, filters.userId));
  }
  if (filters?.action) {
    conditions.push(eq(auditLogs.action, filters.action as any));
  }
  if (filters?.entityType) {
    conditions.push(eq(auditLogs.entityType, filters.entityType as any));
  }
  if (filters?.startDate) {
    conditions.push(gte(auditLogs.createdAt, filters.startDate));
  }
  if (filters?.endDate) {
    conditions.push(lte(auditLogs.createdAt, filters.endDate));
  }
  
  const baseQuery = db
    .select({
      id: auditLogs.id,
      organizationId: auditLogs.organizationId,
      userId: auditLogs.userId,
      userName: users.name,
      userEmail: users.email,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      entityName: auditLogs.entityName,
      changes: auditLogs.changes,
      ipAddress: auditLogs.ipAddress,
      userAgent: auditLogs.userAgent,
      metadata: auditLogs.metadata,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(auditLogs.createdAt));
  
  // Apply pagination
  const limit = filters?.limit || 100;
  const offset = filters?.offset || 0;
  
  const result = await baseQuery.limit(limit).offset(offset);
  return result;
}

export async function getAuditLogsByEntity(
  orgId: number,
  entityType: string,
  entityId: number
) {
  const db = await getDb();
  if (!db) return [];

  const { desc, eq, sql } = await import("drizzle-orm");
  const result = await db
    .select({
      id: auditLogs.id,
      organizationId: auditLogs.organizationId,
      userId: auditLogs.userId,
      userName: users.name,
      userEmail: users.email,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      entityName: auditLogs.entityName,
      changes: auditLogs.changes,
      ipAddress: auditLogs.ipAddress,
      userAgent: auditLogs.userAgent,
      metadata: auditLogs.metadata,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(
      sql`${auditLogs.organizationId} = ${orgId} AND ${auditLogs.entityType} = ${entityType} AND ${auditLogs.entityId} = ${entityId}`
    )
    .orderBy(desc(auditLogs.createdAt));
  
  return result;
}

// ==================== Bulk Job Import Functions ====================

export async function bulkImportJobs(
  orgId: number,
  jobsData: Array<{
    title: string;
    description?: string;
    jobType: 'crop_dusting' | 'pest_control' | 'fertilization' | 'herbicide';
    priority: 'low' | 'medium' | 'high' | 'urgent';
    statusId?: number;
    customerId?: number;
    assignedPersonnelId?: number;
    equipmentId?: number;
    scheduledStart?: Date;
    locationAddress?: string;
    acres?: number;
    chemicalProduct?: string;
    epaNumber?: string;
    targetPest?: string;
    applicationRate?: string;
    notes?: string;
  }>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { jobs } = await import("../drizzle/schema");
  
  // Get default status for the organization if not provided
  const defaultStatus = await getJobStatusesByOrgId(orgId);
  const defaultStatusId = defaultStatus.find(s => s.isDefault)?.id || defaultStatus[0]?.id;
  
  const results: Array<{ success: boolean; job?: any; error?: string }> = [];
  
  for (const jobData of jobsData) {
    try {
      const jobToInsert = {
        ...jobData,
        orgId,
        statusId: jobData.statusId || defaultStatusId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      const result = await db.insert(jobs).values(jobToInsert as any).returning();
      results.push({ success: true, job: result[0] });
    } catch (error: any) {
      results.push({ success: false, error: error.message });
    }
  }
  
  return results;
}

export async function findCustomerByName(orgId: number, name: string) {
  const db = await getDb();
  if (!db) return null;
  
  const { customers } = await import("../drizzle/schema");
  const { sql } = await import("drizzle-orm");
  const result = await db
    .select()
    .from(customers)
    .where(sql`${customers.orgId} = ${orgId} AND LOWER(${customers.name}) = LOWER(${name})`)
    .limit(1);
  
  return result[0] || null;
}
export async function findPersonnelByName(orgId: number, name: string) {
  const db = await getDb();
  if (!db) return null;
  
  const { personnel } = await import("../drizzle/schema");
  const { sql } = await import("drizzle-orm");
  const result = await db
    .select()
    .from(personnel)
    .where(sql`${personnel.orgId} = ${orgId} AND LOWER(${personnel.name}) = LOWER(${name})`)
    .limit(1);
  
  return result[0] || null;
}
export async function findEquipmentByName(orgId: number, name: string) {
  const db = await getDb();
  if (!db) return null;
  
  const { equipment } = await import("../drizzle/schema");
  const { sql } = await import("drizzle-orm");
  const result = await db
    .select()
    .from(equipment)
    .where(sql`${equipment.orgId} = ${orgId} AND LOWER(${equipment.name}) = LOWER(${name})`)
    .limit(1);
  
  return result[0] || null;
}


export async function createProduct(productData: any) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const { productsComplete } = await import("../drizzle/schema");
  const { or } = await import("drizzle-orm");
  
  // Map extracted product data to schema columns
  const insertData: any = {
    orgId: productData.orgId,
    nickname: productData.productName || "Unnamed Product",
    epaNumber: productData.epaNumber || null,
    manufacturer: productData.registrant || null,
    activeIngredients: productData.activeIngredients || null,
    labelSignalWord: productData.labelSignalWord || null,
    reentryPpe: productData.ppeInformation || null,
    additionalRestrictions: productData.genericConditions || null,
    extractedFromScreenshot: true,
    // Extended label fields
    labelVersion: productData.labelVersion || null,
    productType: productData.productType || null,
    applicationMethods: productData.applicationMethods || null,
    modeOfAction: productData.modeOfAction || null,
    physicalState: productData.physicalState || null,
    formulationType: productData.formulationType || null,
    toxicTo: productData.toxicTo || null,
    rainfastness: productData.rainfastness || null,
    federallyRestricted: productData.federallyRestricted ?? false,
    organicCertifications: productData.organicCertifications || null,
    postingRequired: productData.postingRequired ?? false,
    avoidGrazing: productData.avoidGrazing ?? false,
    responseNumber: productData.responseNumber || null,
    medicalNumber: productData.medicalNumber || null,
    generalNotice: productData.generalNotice || null,
  };
  
  // Parse re-entry interval (convert "48 hours" to numeric)
  if (productData.reEntryInterval) {
    const hoursMatch = productData.reEntryInterval.match(/(\d+)\s*hours?/i);
    if (hoursMatch) {
      insertData.hoursReentry = parseFloat(hoursMatch[1]);
    }
  }
  
  // Parse pre-harvest interval (convert "7 days" to numeric)
  if (productData.preharvestInterval) {
    const daysMatch = productData.preharvestInterval.match(/(\d+)\s*days?/i);
    if (daysMatch) {
      insertData.daysPreharvest = parseFloat(daysMatch[1]);
    }
  }
  
  const result = await db.insert(productsComplete).values(insertData).returning();
  return result[0];
}
export async function getProductById(id: number) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const { productsComplete } = await import("../drizzle/schema");
  const { eq, or } = await import("drizzle-orm");
  const result = await db.select().from(productsComplete).where(eq(productsComplete.id, id)).limit(1);
  return result[0] || null;
}
export async function searchProducts(searchTerm: string) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const { productsComplete } = await import("../drizzle/schema");
  const { ilike, like, or } = await import("drizzle-orm");
  
  const result = await db
    .select({
      id: productsComplete.id,
      nickname: productsComplete.nickname,
      epaNumber: productsComplete.epaNumber,
      manufacturer: productsComplete.manufacturer,
      activeIngredients: productsComplete.activeIngredients,
    })
    .from(productsComplete)
    .where(
      or(
        ilike(productsComplete.nickname, `%${searchTerm}%`),
        ilike(productsComplete.epaNumber, `%${searchTerm}%`),
        ilike(productsComplete.manufacturer, `%${searchTerm}%`)
      )
    )
    .limit(50);

  return result;
}

// ============================================================================
// Jobs V2 helpers - Simplified job management
// ============================================================================

export async function createJobV2(data: InsertJob) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { or } = await import("drizzle-orm");
  
  const result = await db.insert(jobs).values(data).returning();
  return result[0];
}
export async function getJobsV2ByOrgId(orgId: number) {
  const db = await getDb();
  if (!db) return [];
  
  const { desc, eq } = await import("drizzle-orm");
  
  const result = await db
    .select()
    .from(jobs)
    .where(eq(jobs.orgId, orgId))
    .orderBy(desc(jobs.createdAt));
  
  return result;
}

export async function getJobV2ById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { eq, or } = await import("drizzle-orm");
  
  const result = await db
    .select()
    .from(jobs)
    .where(eq(jobs.id, id))
    .limit(1);
  
  return result[0] || null;
}
export async function updateJobV2Product(jobId: number, productId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { eq, or } = await import("drizzle-orm");
  
  const result = await db
    .update(jobs)
    .set({ productId, updatedAt: new Date() })
    .where(eq(jobs.id, jobId))
    .returning();
  
  return result[0];
}
export async function getJobV2WithProduct(jobId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { or } = await import("drizzle-orm");
  
  const job = await getJobV2ById(jobId);
  if (!job) return null;
  
  if (job.productId) {
    const product = await getProductById(job.productId);
    return { ...job, product };
  }
  
  return { ...job, product: null };
}


export async function getJobsV2WithRelations(orgId: number) {
  const db = await getDb();
  if (!db) return [];
  const { desc, eq } = await import("drizzle-orm");
  
  const result = await db
    .select({
      id: jobs.id,
      orgId: jobs.orgId,
      title: jobs.title,
      description: jobs.description,
      jobType: jobs.jobType,
      priority: jobs.priority,
      statusId: jobs.statusId,
      location: jobs.locationAddress,
      scheduledStart: jobs.scheduledStart,
      scheduledEnd: jobs.scheduledEnd,
      createdAt: jobs.createdAt,
      updatedAt: jobs.updatedAt,
      // Customer info
      customerId: jobs.customerId,
      customerName: customers.name,
      // Personnel info (alias assignedPersonnelId as personnelId for backward compatibility)
      personnelId: jobs.assignedPersonnelId,
      personnelName: personnel.name,
      // Equipment info
      equipmentId: jobs.equipmentId,
      equipmentName: equipment.name,
      // Product info
      productId: jobs.productId,
    })
    .from(jobs)
    .leftJoin(customers, eq(jobs.customerId, customers.id))
    .leftJoin(personnel, eq(jobs.assignedPersonnelId, personnel.id))
    .leftJoin(equipment, eq(jobs.equipmentId, equipment.id))
    .where(eq(jobs.orgId, orgId))
    .orderBy(desc(jobs.createdAt));
  
  return result;
}

export async function updateJobV2(id: number, updates: Partial<{
  title: string;
  description: string | null;
  jobType: string | null;
  priority: string;
  status: string;
  customerId: number | null;
  personnelId: number | null;
  equipmentId: number | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  treatmentPolygon: any | null;
  acres: number | null;
}>) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const { jobs } = await import("../drizzle/schema");
  const { eq, or } = await import("drizzle-orm");
  
  // Build update object with only provided fields
  const updateData: any = { updatedAt: new Date() };
  if (updates.title !== undefined) updateData.title = updates.title;
  if (updates.description !== undefined) updateData.description = updates.description;
  if (updates.jobType !== undefined) updateData.jobType = updates.jobType;
  if (updates.priority !== undefined) updateData.priority = updates.priority;
  if (updates.status !== undefined) updateData.status = updates.status;
  if (updates.customerId !== undefined) updateData.customerId = updates.customerId;
  if (updates.personnelId !== undefined) updateData.assignedPersonnelId = updates.personnelId;
  if (updates.equipmentId !== undefined) updateData.equipmentId = updates.equipmentId;
  if (updates.location !== undefined) updateData.locationAddress = updates.location;
  if (updates.latitude !== undefined) updateData.locationLat = updates.latitude != null ? String(updates.latitude) : null;
  if (updates.longitude !== undefined) updateData.locationLng = updates.longitude != null ? String(updates.longitude) : null;
  if (updates.scheduledStart !== undefined) updateData.scheduledStart = updates.scheduledStart;
  if (updates.scheduledEnd !== undefined) updateData.scheduledEnd = updates.scheduledEnd;
  if (updates.treatmentPolygon !== undefined) updateData.treatmentPolygon = updates.treatmentPolygon;
  if (updates.acres !== undefined) updateData.acres = updates.acres != null ? String(updates.acres) : null;
  
  const result = await db
    .update(jobs)
    .set(updateData)
    .where(eq(jobs.id, id))
    .returning();
  
  return result[0];
}


export async function deleteJobV2(id: number) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const { jobs } = await import("../drizzle/schema");
  const { eq, or } = await import("drizzle-orm");
  
  const result = await db
    .delete(jobs)
    .where(eq(jobs.id, id))
    .returning();
  
  return result[0];
}

// ==================== Map Files Functions ====================

export async function createMapFile(data: {
  jobId: number;
  name: string;
  fileType: "kml" | "gpx" | "geojson";
  fileUrl: string;
  fileKey: string;
  fileSize?: number;
  uploadedBy?: number;
  orgId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { maps } = await import("../drizzle/schema");
  const { or } = await import("drizzle-orm");
  
  // Build insert data with only the fields we want to provide
  const insertData: any = {
    orgId: data.orgId,
    jobId: data.jobId,
    name: data.name,
    fileUrl: data.fileUrl,
    fileKey: data.fileKey,
    fileType: data.fileType,
  };
  
  // Add optional fields only if provided
  if (data.fileSize !== undefined) {
    insertData.fileSize = data.fileSize;
  }
  if (data.uploadedBy !== undefined) {
    insertData.uploadedBy = data.uploadedBy;
  }
  
  const result = await db.insert(maps).values(insertData).returning();
  return result[0];
}
export async function getMapFilesByJobId(jobId: number) {
  const db = await getDb();
  if (!db) return [];

  const { maps } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  
  return await db
    .select()
    .from(maps)
    .where(eq(maps.jobId, jobId));
}

export async function deleteMapFile(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { maps } = await import("../drizzle/schema");
  const { eq, or } = await import("drizzle-orm");
  
  const result = await db
    .delete(maps)
    .where(eq(maps.id, id))
    .returning();
  
  return result[0];
}


// Waitlist functions
export async function createWaitlistEntry(data: InsertWaitlist) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { or } = await import("drizzle-orm");

  const result = await db.insert(waitlist).values(data).returning();
  return result[0];
}

export async function createApiKey(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { apiKeys } = await import("../drizzle/schema");
  const { or } = await import("drizzle-orm");
  const result = await db.insert(apiKeys).values(data).returning();
  return result[0];
}
export async function getApiKeysByOrgId(orgId: number) {
  const db = await getDb();
  if (!db) return [];
  
  const { apiKeys } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  return await db.select().from(apiKeys).where(eq(apiKeys.organizationId, orgId));
}
export async function getApiKeyByHash(keyHash: string) {
  const db = await getDb();
  if (!db) return undefined;
  
  const { apiKeys } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  const result = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash)).limit(1);
  return result[0];
}
export async function updateApiKeyUsage(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { apiKeys } = await import("../drizzle/schema");
  const { eq, or, sql } = await import("drizzle-orm");
  await db.update(apiKeys)
    .set({ 
      lastUsedAt: new Date(), 
      usageCount: sql`${apiKeys.usageCount} + 1`
    })
    .where(eq(apiKeys.id, id));
}

export async function deleteApiKey(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { apiKeys } = await import("../drizzle/schema");
  const { eq, or } = await import("drizzle-orm");
  await db.delete(apiKeys).where(eq(apiKeys.id, id));
}
export async function logApiUsage(data: any) {
  const db = await getDb();
  if (!db) return;
  
  const { apiUsageLogs } = await import("../drizzle/schema");
  await db.insert(apiUsageLogs).values(data);
}

// Job Sharing
export async function createJobShare(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { jobShares } = await import("../drizzle/schema");
  const { or } = await import("drizzle-orm");
  const result = await db.insert(jobShares).values(data).returning();
  return result[0];
}
export async function getJobSharesByJobId(jobId: number) {
  const db = await getDb();
  if (!db) return [];
  
  const { jobShares } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  return await db.select().from(jobShares).where(eq(jobShares.jobId, jobId));
}
export async function getJobShareByToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;
  
  const { jobShares } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  const result = await db.select().from(jobShares).where(eq(jobShares.shareToken, token)).limit(1);
  return result[0];
}
export async function updateJobShareAccess(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { jobShares } = await import("../drizzle/schema");
  const { eq, or, sql } = await import("drizzle-orm");
  await db.update(jobShares)
    .set({ 
      lastAccessedAt: new Date(), 
      viewCount: sql`${jobShares.viewCount} + 1`
    })
    .where(eq(jobShares.id, id));
}

export async function deleteJobShare(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { jobShares } = await import("../drizzle/schema");
  const { eq, or } = await import("drizzle-orm");
  await db.delete(jobShares).where(eq(jobShares.id, id));
}

export async function getCustomerById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const { customers } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  const result = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  return result[0];
}

export async function getSitesByCustomerId(customerId: number) {
  const db = await getDb();
  if (!db) return [];

  const { sites, customers } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  const result = await db.select({
    id: sites.id,
    name: sites.name,
    siteType: sites.siteType,
    address: sites.address,
    city: sites.city,
    state: sites.state,
    zipCode: sites.zipCode,
    acres: sites.acres,
    crop: sites.crop,
    variety: sites.variety,
    polygon: sites.polygon,
    propertyType: sites.propertyType,
    units: sites.units,
    notes: sites.notes,
    centerLat: sites.centerLat,
    centerLng: sites.centerLng,
    createdAt: sites.createdAt,
    customerName: customers.name,
  }).from(sites)
    .leftJoin(customers, eq(sites.customerId, customers.id))
    .where(eq(sites.customerId, customerId));
  return result;
}

export async function getJobsByCustomerId(customerId: number) {
  const db = await getDb();
  if (!db) return [];

  const { jobsV2 } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  const result = await db.select({
    id: jobsV2.id,
    title: jobsV2.title,
    status: jobsV2.status,
    jobType: jobsV2.jobType,
    priority: jobsV2.priority,
    scheduledStart: jobsV2.scheduledStart,
    scheduledEnd: jobsV2.scheduledEnd,
    createdAt: jobsV2.createdAt,
  }).from(jobsV2)
    .where(eq(jobsV2.customerId, customerId));
  return result;
}

export async function getServicePlansByCustomerId(customerId: number) {
  const db = await getDb();
  if (!db) return [];

  const { servicePlans } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  const result = await db.select().from(servicePlans)
    .where(eq(servicePlans.customerId, customerId));
  return result;
}

export async function getMapById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const { maps } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  const result = await db.select().from(maps).where(eq(maps.id, id)).limit(1);
  return result[0];
}

export async function updateMap(id: number, data: { name?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { maps } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  const result = await db.update(maps).set({ ...data, updatedAt: new Date() }).where(eq(maps.id, id)).returning();
  return result[0];
}

export async function getPersonnelById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const { personnel } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  const result = await db.select().from(personnel).where(eq(personnel.id, id)).limit(1);
  return result[0];
}

// ==================== Organization AI Config ====================
export async function getOrganizationAiConfig(orgId: number) {
  const db = await getDb();
  if (!db) return null;
  
  const { organizationAiConfig } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  const result = await db.select().from(organizationAiConfig).where(eq(organizationAiConfig.organizationId, orgId)).limit(1);
  return result[0] || null;
}
export async function updateOrganizationAiConfig(orgId: number, data: {
  provider?: "ollama" | "anthropic" | "forge";
  chatModel?: string;
  analysisModel?: string;
  complianceModel?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { organizationAiConfig } = await import("../drizzle/schema");
  const { eq, or } = await import("drizzle-orm");
  
  // Check if config exists
  const existing = await getOrganizationAiConfig(orgId);
  
  if (existing) {
    const result = await db.update(organizationAiConfig)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(organizationAiConfig.id, existing.id))
      .returning();
    return result[0];
  } else {
    const result = await db.insert(organizationAiConfig).values({
      organizationId: orgId,
      provider: data.provider || "anthropic",
      chatModel: data.chatModel,
      analysisModel: data.analysisModel,
      complianceModel: data.complianceModel,
    }).returning();
    return result[0];
  }
}

// ==================== Pre-Flight Checklists ====================
export async function createPreFlightChecklist(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { preFlightChecklists } = await import("../drizzle/schema");
  const { or } = await import("drizzle-orm");
  const result = await db.insert(preFlightChecklists).values(data).returning();
  return result[0];
}
export async function getPreFlightChecklistsByJobId(jobId: number) {
  const db = await getDb();
  if (!db) return [];
  
  const { preFlightChecklists, personnel, equipment } = await import("../drizzle/schema");
  const { desc, eq } = await import("drizzle-orm");
  
  return await db
    .select({
      id: preFlightChecklists.id,
      jobId: preFlightChecklists.jobId,
      pilotId: preFlightChecklists.pilotId,
      aircraftId: preFlightChecklists.aircraftId,
      checklistData: preFlightChecklists.checklistData,
      weatherSnapshot: preFlightChecklists.weatherSnapshot,
      signedBy: preFlightChecklists.signedBy,
      signedAt: preFlightChecklists.signedAt,
      createdAt: preFlightChecklists.createdAt,
      pilotName: personnel.name,
      aircraftName: equipment.name,
    })
    .from(preFlightChecklists)
    .leftJoin(personnel, eq(preFlightChecklists.pilotId, personnel.id))
    .leftJoin(equipment, eq(preFlightChecklists.aircraftId, equipment.id))
    .where(eq(preFlightChecklists.jobId, jobId))
    .orderBy(desc(preFlightChecklists.createdAt));
}

export async function getPreFlightChecklistById(id: number) {
  const db = await getDb();
  if (!db) return null;
  
  const { preFlightChecklists, personnel, equipment } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  
  const result = await db
    .select({
      id: preFlightChecklists.id,
      jobId: preFlightChecklists.jobId,
      pilotId: preFlightChecklists.pilotId,
      aircraftId: preFlightChecklists.aircraftId,
      checklistData: preFlightChecklists.checklistData,
      weatherSnapshot: preFlightChecklists.weatherSnapshot,
      signedBy: preFlightChecklists.signedBy,
      signedAt: preFlightChecklists.signedAt,
      createdAt: preFlightChecklists.createdAt,
      pilotName: personnel.name,
      aircraftName: equipment.name,
    })
    .from(preFlightChecklists)
    .leftJoin(personnel, eq(preFlightChecklists.pilotId, personnel.id))
    .leftJoin(equipment, eq(preFlightChecklists.aircraftId, equipment.id))
    .where(eq(preFlightChecklists.id, id))
    .limit(1);
    
  return result[0] || null;
}


