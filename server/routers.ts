import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { stripeRouter } from "./stripeRouter";
import { modelsRouter } from "./modelsRouter";
import { driftRouter } from "./driftRouter";
import { checklistRouter } from "./checklistRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { updateOrganizationSchema, createCustomerSchema, updateCustomerSchema, createSiteSchema, updateSiteSchema, deleteSiteSchema, createEquipmentSchema, updateEquipmentSchema, deleteEquipmentSchema, createIntegrationConnectionSchema, updateIntegrationConnectionSchema, deleteIntegrationConnectionSchema } from "./validation";
import { getCurrentWeather, getWeatherForecast, evaluateSprayConditions, getHistoricalWeather } from "./weather";

import { isValidEpaNumber } from "../shared/validation";

export const appRouter = router({
  // Waitlist router (public)
  waitlist: router({
    join: publicProcedure
      .input(z.object({
        name: z.string().min(1, "Name is required"),
        email: z.string().email("Invalid email format"),
        company: z.string().optional(),
        phone: z.string().optional(),
        message: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { createWaitlistEntry } = await import("./db");
        return await createWaitlistEntry(input);
      }),
  }),

  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  stripe: stripeRouter,
  models: modelsRouter,
  drift: driftRouter,
  checklist: checklistRouter,
  
  // Weather router
  weather: router({
    current: protectedProcedure
      .input(z.object({
        latitude: z.number(),
        longitude: z.number(),
      }))
      .query(async ({ input }) => {
        const weather = await getCurrentWeather(input.latitude, input.longitude);
        const sprayWindow = evaluateSprayConditions(weather);
        return { weather, sprayWindow };
      }),
    
    forecast: protectedProcedure
      .input(z.object({
        latitude: z.number(),
        longitude: z.number(),
      }))
      .query(async ({ input }) => {
        return await getWeatherForecast(input.latitude, input.longitude);
      }),
    
    historical: protectedProcedure
      .input(z.object({
        latitude: z.number(),
        longitude: z.number(),
        date: z.date(),
      }))
      .query(async ({ input }) => {
        return await getHistoricalWeather(input.latitude, input.longitude, input.date);
      }),
  }),
  auth: router({
    me: publicProcedure.query(opts => {
      return opts.ctx.user;
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Organization router
  organization: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const { getOrCreateUserOrganization } = await import("./db");
      return await getOrCreateUserOrganization(ctx.user.id);
    }),
    update: protectedProcedure
      .input(updateOrganizationSchema)
      .mutation(async ({ ctx, input }) => {
        const { updateOrganization } = await import("./db");
        const { getOrCreateUserOrganization } = await import("./db");
        const org = await getOrCreateUserOrganization(ctx.user.id);
        return await updateOrganization(org.id, input);
      }),
    getMapConfig: protectedProcedure.query(async ({ ctx }) => {
      const { getOrCreateUserOrganization } = await import("./db");
      const org = await getOrCreateUserOrganization(ctx.user.id);
      return { googleMapsApiKey: org.googleMapsApiKey || null };
    }),
  }),

  // Integrations router
  integrations: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getOrCreateUserOrganization, getIntegrationConnections } = await import("./db");
      const org = await getOrCreateUserOrganization(ctx.user.id);
      return await getIntegrationConnections(org.id);
    }),
    create: protectedProcedure
      .input(createIntegrationConnectionSchema)
      .mutation(async ({ ctx, input }) => {
        const { getOrCreateUserOrganization, createIntegrationConnection } = await import("./db");
        const org = await getOrCreateUserOrganization(ctx.user.id);
        return await createIntegrationConnection({ ...input, organizationId: org.id });
      }),
    update: protectedProcedure
      .input(updateIntegrationConnectionSchema)
      .mutation(async ({ input }) => {
        const { updateIntegrationConnection } = await import("./db");
        const { id, ...data } = input;
        return await updateIntegrationConnection(id, data);
      }),
    delete: protectedProcedure
      .input(deleteIntegrationConnectionSchema)
      .mutation(async ({ input }) => {
        const { deleteIntegrationConnection } = await import("./db");
        await deleteIntegrationConnection(input.id);
        return { success: true };
      }),
  }),

  // Customer router
  customers: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getOrCreateUserOrganization, getCustomersByOrgId } = await import("./db");
      const org = await getOrCreateUserOrganization(ctx.user.id);
      return await getCustomersByOrgId(org.id);
    }),
    create: protectedProcedure
      .input(createCustomerSchema)
      .mutation(async ({ ctx, input }) => {
        const { getOrCreateUserOrganization, createCustomer, createAuditLog } = await import("./db");
        const org = await getOrCreateUserOrganization(ctx.user.id);
        const customer = await createCustomer({ ...input, orgId: org.id });
        
        await createAuditLog({
          userId: ctx.user.id,
          organizationId: org.id,
          action: "create",
          entityType: "customer",
          entityId: customer.id,
          changes: JSON.stringify({ created: input }),
          ipAddress: ctx.req.ip || null,
          userAgent: ctx.req.get("user-agent") || null,
        });
        
        return customer;
      }),
    update: protectedProcedure
      .input(updateCustomerSchema)
      .mutation(async ({ ctx, input }) => {
        const { updateCustomer, getOrCreateUserOrganization, getCustomerById, createAuditLog } = await import("./db");
        const org = await getOrCreateUserOrganization(ctx.user.id);
        const existing = await getCustomerById(input.id);
        if (existing && existing.orgId !== org.id) throw new Error("Not found");
        const customer = await updateCustomer(input.id, input);
        
        await createAuditLog({
          userId: ctx.user.id,
          organizationId: org.id,
          action: "update",
          entityType: "customer",
          entityId: input.id,
          changes: JSON.stringify({ updated: input }),
          ipAddress: ctx.req.ip || null,
          userAgent: ctx.req.get("user-agent") || null,
        });
        
        return customer;
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { deleteCustomer, getOrCreateUserOrganization, getCustomerById, createAuditLog } = await import("./db");
        const org = await getOrCreateUserOrganization(ctx.user.id);
        const existing = await getCustomerById(input.id);
        if (existing && existing.orgId !== org.id) throw new Error("Not found");

        await deleteCustomer(input.id);

        await createAuditLog({
          userId: ctx.user.id,
          organizationId: org.id,
          action: "delete",
          entityType: "customer",
          entityId: input.id,
          changes: JSON.stringify({ deleted: true }),
          ipAddress: ctx.req.ip || null,
          userAgent: ctx.req.get("user-agent") || null,
        });

        return { success: true };
      }),
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const { getOrCreateUserOrganization, getCustomerById } = await import("./db");
        const org = await getOrCreateUserOrganization(ctx.user.id);
        const customer = await getCustomerById(input.id);
        if (customer && customer.orgId !== org.id) throw new Error("Not found");
        return customer;
      }),
    getSites: protectedProcedure
      .input(z.object({ customerId: z.number() }))
      .query(async ({ ctx, input }) => {
        const { getOrCreateUserOrganization, getCustomerById, getSitesByCustomerId } = await import("./db");
        const org = await getOrCreateUserOrganization(ctx.user.id);
        const customer = await getCustomerById(input.customerId);
        if (customer && customer.orgId !== org.id) throw new Error("Not found");
        return await getSitesByCustomerId(input.customerId);
      }),
    getJobs: protectedProcedure
      .input(z.object({ customerId: z.number() }))
      .query(async ({ ctx, input }) => {
        const { getOrCreateUserOrganization, getCustomerById, getJobsByCustomerId } = await import("./db");
        const org = await getOrCreateUserOrganization(ctx.user.id);
        const customer = await getCustomerById(input.customerId);
        if (customer && customer.orgId !== org.id) throw new Error("Not found");
        return await getJobsByCustomerId(input.customerId);
      }),
    getServicePlans: protectedProcedure
      .input(z.object({ customerId: z.number() }))
      .query(async ({ input }) => {
        const { getServicePlansByCustomerId } = await import("./db");
        return await getServicePlansByCustomerId(input.customerId);
      }),
  }),

  // Jobs router
  jobs: router({
    list: protectedProcedure
      .input(z.object({
        page: z.number().min(1).default(1).optional(),
        pageSize: z.number().min(1).max(100).default(25).optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const { getOrCreateUserOrganization, getJobsByOrgId } = await import("./db");
        const org = await getOrCreateUserOrganization(ctx.user.id);
        return await getJobsByOrgId(org.id, input);
      }),
    create: protectedProcedure
      .input(z.object({
        title: z.string().min(1, "Job title is required"),
        description: z.string().optional(),
        jobType: z.enum(["crop_dusting", "pest_control", "fertilization", "herbicide"]),
        statusId: z.number().optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
        locationAddress: z.string().optional(),
        locationLat: z.string().optional(),
        locationLng: z.string().optional(),
        customerId: z.number().optional(),
        siteId: z.number().optional(),
        assignedPersonnelId: z.number().optional(),
        equipmentId: z.number().optional(),
        scheduledStart: z.string().optional(),
        scheduledEnd: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getOrCreateUserOrganization, createJob, createAuditLog } = await import("./db");
        const org = await getOrCreateUserOrganization(ctx.user.id);
        const job = await createJob({ ...input, orgId: org.id });
        
        // Create audit log
        await createAuditLog({
          userId: ctx.user.id,
          organizationId: org.id,
          action: "create",
          entityType: "job",
          entityId: job.id as number,
          changes: JSON.stringify({ created: input }),
          ipAddress: ctx.req.ip || null,
          userAgent: ctx.req.get("user-agent") || null,
        });
        
        return job;
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().min(1, "Job title is required").optional(),
        description: z.string().optional(),
        jobType: z.enum(["crop_dusting", "pest_control", "fertilization", "herbicide"]).optional(),
        statusId: z.number().optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
        locationAddress: z.string().optional(),
        locationLat: z.string().optional(),
        locationLng: z.string().optional(),
        customerId: z.number().optional(),
        assignedPersonnelId: z.number().optional(),
        equipmentId: z.number().optional(),
        productId: z.number().optional(),
        scheduledStart: z.string().optional(),
        scheduledEnd: z.string().optional(),
        state: z.string().optional(),
        commodityCrop: z.string().optional(),
        targetPest: z.string().optional(),
        epaNumber: z.string().optional(),
        applicationRate: z.string().optional(),
        applicationMethod: z.string().optional(),
        chemicalProduct: z.string().optional(),
        reEntryInterval: z.string().optional(),
        preharvestInterval: z.string().optional(),
        maxApplicationsPerSeason: z.string().optional(),
        maxRatePerSeason: z.string().optional(),
        methodsAllowed: z.string().optional(),
        rate: z.string().optional(),
        diluentAerial: z.string().optional(),
        diluentGround: z.string().optional(),
        diluentChemigation: z.string().optional(),
        genericConditions: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { updateJob, getJobById, createJobStatusHistory, getOrCreateUserOrganization, createAuditLog } = await import("./db");
        const org = await getOrCreateUserOrganization(ctx.user.id);
        
        // Get current job state for audit log
        const currentJob = await getJobById(input.id);
        
        // If status is being changed, log it to history
        // Status history tracking disabled - statusId field not in current schema
        // TODO: Re-enable when status tracking is needed
        // if (input.statusId !== undefined) {
        //   if (currentJob && currentJob.statusId !== input.statusId) {
        //     await createJobStatusHistory({
        //       jobId: input.id,
        //       fromStatusId: currentJob.statusId,
        //       toStatusId: input.statusId,
        //       changedByUserId: ctx.user.id,
        //     });
        //   }
        // }
        
        const updatedJob = await updateJob(input.id, input);
        
        // Create audit log
        await createAuditLog({
          userId: ctx.user.id,
          organizationId: org.id,
          action: "update",
          entityType: "job",
          entityId: input.id,
          changes: JSON.stringify({ before: currentJob, after: input }),
          ipAddress: ctx.req.ip || null,
          userAgent: ctx.req.get("user-agent") || null,
        });
        
        return updatedJob;
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { deleteJob, getJobById, getOrCreateUserOrganization, createAuditLog } = await import("./db");
        const org = await getOrCreateUserOrganization(ctx.user.id);
        
        // Get job before deletion for audit log
        const job = await getJobById(input.id);
        
        await deleteJob(input.id);
        
        // Create audit log
        if (job) {
          await createAuditLog({
            userId: ctx.user.id,
            organizationId: org.id,
            action: "delete",
            entityType: "job",
            entityId: input.id,
            changes: JSON.stringify({ deleted: job }),
            ipAddress: ctx.req.ip || null,
            userAgent: ctx.req.get("user-agent") || null,
          });
        }
        
        return { success: true };
      }),
    history: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .query(async ({ input }) => {
        const { getJobStatusHistory } = await import("./db");
        return await getJobStatusHistory(input.jobId);
      }),
    bulkImport: protectedProcedure
      .input(z.object({
        csvContent: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getOrCreateUserOrganization, bulkImportJobs, findCustomerByName, findPersonnelByName, findEquipmentByName } = await import("./db");
        const { parseCSV, validateJobRow, normalizeJobType, normalizePriority } = await import("./csvUtils");
        
        const org = await getOrCreateUserOrganization(ctx.user.id);
        
        // Parse CSV
        const parsed = parseCSV(input.csvContent);
        
        if (parsed.errors.length > 0) {
          return {
            success: false,
            totalRows: 0,
            successCount: 0,
            errorCount: parsed.errors.length,
            errors: parsed.errors.map((err: any) => ({
              row: err.row || 0,
              message: err.message,
            })),
            createdJobs: [],
          };
        }
        
        const jobsToImport = [];
        const errors: Array<{ row: number; field?: string; message: string; data?: any }> = [];
        
        // Validate and prepare jobs
        for (let i = 0; i < parsed.data.length; i++) {
          const row = parsed.data[i];
          const rowNum = i + 2; // +2 because row 1 is header, and we're 0-indexed
          
          const validation = validateJobRow(row, rowNum);
          if (!validation.valid) {
            validation.errors.forEach(err => {
              errors.push({ row: rowNum, message: err, data: row });
            });
            continue;
          }
          
          // Resolve customer, personnel, equipment by name
          let customerId: number | undefined;
          let assignedPersonnelId: number | undefined;
          let equipmentId: number | undefined;
          
          if (row.customerName) {
            const customer = await findCustomerByName(org.id, row.customerName);
            if (customer) {
              customerId = customer.id;
            } else {
              errors.push({ row: rowNum, field: 'customerName', message: `Customer not found: ${row.customerName}`, data: row });
            }
          }
          
          if (row.personnelName) {
            const personnel = await findPersonnelByName(org.id, row.personnelName);
            if (personnel) {
              assignedPersonnelId = personnel.id;
            } else {
              errors.push({ row: rowNum, field: 'personnelName', message: `Personnel not found: ${row.personnelName}`, data: row });
            }
          }
          
          if (row.equipmentName) {
            const equipment = await findEquipmentByName(org.id, row.equipmentName);
            if (equipment) {
              equipmentId = equipment.id;
            } else {
              errors.push({ row: rowNum, field: 'equipmentName', message: `Equipment not found: ${row.equipmentName}`, data: row });
            }
          }
          
          jobsToImport.push({
            title: row.title,
            description: row.description,
            jobType: normalizeJobType(row.jobType || 'crop_dusting'),
            priority: normalizePriority(row.priority),
            customerId,
            assignedPersonnelId,
            equipmentId,
            scheduledStart: row.scheduledDate ? new Date(row.scheduledDate) : undefined,
            locationAddress: row.locationAddress,
            acres: row.acres ? parseFloat(row.acres) : undefined,
            chemicalProduct: row.chemicalProduct,
            epaNumber: row.epaRegistrationNumber,
            targetPest: row.targetPest,
            applicationRate: row.applicationRate,
            notes: row.notes,
          });
        }
        
        // Import jobs
        const results = await bulkImportJobs(org.id, jobsToImport);
        
        const createdJobs = results
          .filter(r => r.success && r.job)
          .map(r => ({ id: r.job.id, title: r.job.title }));
        
        const importErrors = results
          .map((r, idx) => {
            if (!r.success) {
              return {
                row: idx + 2,
                message: r.error || 'Unknown error',
              };
            }
            return null;
          })
          .filter(Boolean) as Array<{ row: number; message: string }>;
        
        return {
          success: errors.length === 0 && importErrors.length === 0,
          totalRows: parsed.data.length,
          successCount: createdJobs.length,
          errorCount: errors.length + importErrors.length,
          errors: [...errors, ...importErrors],
          createdJobs,
        };
      }),
  }),

  // Job Statuses router
  jobStatuses: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getOrCreateUserOrganization, getJobStatusesByOrgId, ensureDefaultJobStatuses } = await import("./db");
      const org = await getOrCreateUserOrganization(ctx.user.id);
      await ensureDefaultJobStatuses(org.id);
      return await getJobStatusesByOrgId(org.id);
    }),
    create: protectedProcedure
      .input(
        z.object({
          name: z.string(),
          color: z.string(),
          displayOrder: z.number(),
          category: z.string(),
          isDefault: z.boolean().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { getOrCreateUserOrganization, createJobStatus } = await import("./db");
        const org = await getOrCreateUserOrganization(ctx.user.id);
        return await createJobStatus({ ...input, orgId: org.id });
      }),
    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().optional(),
          color: z.string().optional(),
          displayOrder: z.number().optional(),
          category: z.string().optional(),
          isDefault: z.boolean().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { updateJobStatus } = await import("./db");
        const { id, ...data } = input;
        return await updateJobStatus(id, data);
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const { deleteJobStatus } = await import("./db");
        await deleteJobStatus(input.id);
        return { success: true };
      }),
    reorder: protectedProcedure
      .input(
        z.object({
          statusIds: z.array(z.number()),
        })
      )
      .mutation(async ({ input }) => {
        const { reorderJobStatuses } = await import("./db");
        await reorderJobStatuses(input.statusIds);
        return { success: true };
      }),
  }),

  // Personnel router
  personnel: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getOrCreateUserOrganization, getPersonnelByOrgId } = await import("./db");
      const org = await getOrCreateUserOrganization(ctx.user.id);
      return await getPersonnelByOrgId(org.id);
    }),
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1, "Personnel name is required"),
        role: z.enum(["pilot", "ground_crew", "manager", "technician"]),
        email: z.string().email("Invalid email format").optional().or(z.literal("")),
        phone: z.string().optional(),
        status: z.enum(["active", "inactive", "on_leave"]).default("active"),
        pilotLicense: z.string().optional(),
        applicatorLicense: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getOrCreateUserOrganization, createPersonnel } = await import("./db");
        const org = await getOrCreateUserOrganization(ctx.user.id);
        return await createPersonnel({ ...input, orgId: org.id });
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1, "Personnel name is required").optional(),
        role: z.enum(["pilot", "ground_crew", "manager", "technician"]).optional(),
        email: z.string().email("Invalid email format").optional().or(z.literal("")),
        phone: z.string().optional(),
        status: z.enum(["active", "inactive", "on_leave"]).optional(),
        pilotLicense: z.string().optional(),
        applicatorLicense: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { updatePersonnel } = await import("./db");
        return await updatePersonnel(input.id, input);
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const { deletePersonnel } = await import("./db");
        await deletePersonnel(input.id);
        return { success: true };
      }),
  }),

  // Products router
  products: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getOrCreateUserOrganization, getProductsByOrgId } = await import("./db");
      const org = await getOrCreateUserOrganization(ctx.user.id);
      return await getProductsByOrgId(org.id);
    }),
    extractFromScreenshot: protectedProcedure
      .input(z.object({
        imageData: z.string(), // base64 encoded image
      }))
      .mutation(async ({ ctx, input }) => {
        const { invokeLLM } = await import("./_core/llm");
        
        try {
          // Vision tasks always use Anthropic (Ollama vision support is limited)
          const response = await invokeLLM({
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "image_url",
                    image_url: {
                      url: input.imageData,
                    },
                  },
                  {
                    type: "text",
                    text: `Extract all product information from this Agrian Label Center screenshot. Return a JSON object with these fields:

GENERAL: productName, epaNumber, registrant, activeIngredients (with percentages), labelVersion, productType (Herbicide/Insecticide/etc.), applicationMethods, modeOfAction, physicalState, formulationType, rainfastness, toxicTo
APPLICATION: reEntryInterval, preharvestInterval, maxApplicationsPerSeason, maxRatePerSeason, methodsAllowed, rate, diluentAerial, diluentGround, diluentChemigation
SAFETY: ppeInformation, labelSignalWord (DANGER/WARNING/CAUTION), responseNumber (emergency phone), medicalNumber (medical phone)
REGULATORY: federallyRestricted (boolean), organicCertifications, postingRequired (boolean), avoidGrazing (boolean)
NOTICES: generalNotice (summarize first aid, precautionary statements, environmental hazards), genericConditions (additional info, special conditions)

If a field is not visible, set it to an empty string (or false for booleans). Be precise and extract exactly what you see.`,
                  },
                ],
              },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "product_extraction",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    productName: { type: "string" },
                    epaNumber: { type: "string" },
                    registrant: { type: "string" },
                    activeIngredients: { type: "string" },
                    labelVersion: { type: "string" },
                    productType: { type: "string" },
                    applicationMethods: { type: "string" },
                    modeOfAction: { type: "string" },
                    physicalState: { type: "string" },
                    formulationType: { type: "string" },
                    rainfastness: { type: "string" },
                    toxicTo: { type: "string" },
                    reEntryInterval: { type: "string" },
                    preharvestInterval: { type: "string" },
                    maxApplicationsPerSeason: { type: "string" },
                    maxRatePerSeason: { type: "string" },
                    methodsAllowed: { type: "string" },
                    rate: { type: "string" },
                    diluentAerial: { type: "string" },
                    diluentGround: { type: "string" },
                    diluentChemigation: { type: "string" },
                    ppeInformation: { type: "string" },
                    labelSignalWord: { type: "string" },
                    responseNumber: { type: "string" },
                    medicalNumber: { type: "string" },
                    federallyRestricted: { type: "boolean" },
                    organicCertifications: { type: "string" },
                    postingRequired: { type: "boolean" },
                    avoidGrazing: { type: "boolean" },
                    generalNotice: { type: "string" },
                    genericConditions: { type: "string" },
                  },
                  required: [
                    "productName",
                    "epaNumber",
                    "registrant",
                    "activeIngredients",
                    "labelVersion",
                    "productType",
                    "applicationMethods",
                    "modeOfAction",
                    "physicalState",
                    "formulationType",
                    "rainfastness",
                    "toxicTo",
                    "reEntryInterval",
                    "preharvestInterval",
                    "maxApplicationsPerSeason",
                    "maxRatePerSeason",
                    "methodsAllowed",
                    "rate",
                    "diluentAerial",
                    "diluentGround",
                    "diluentChemigation",
                    "ppeInformation",
                    "labelSignalWord",
                    "responseNumber",
                    "medicalNumber",
                    "federallyRestricted",
                    "organicCertifications",
                    "postingRequired",
                    "avoidGrazing",
                    "generalNotice",
                    "genericConditions",
                  ],
                  additionalProperties: false,
                },
              },
            },
          }, { provider: "anthropic" });

          const content = response.choices[0]?.message?.content;
          if (!content || typeof content !== 'string') {
            return {
              success: false,
              error: "No response from AI",
            };
          }

          const extractedData = JSON.parse(content);
          
          return {
            success: true,
            extractedData,
          };
        } catch (error: any) {
          console.error("Error extracting product data:", error);
          return {
            success: false,
            error: error.message || "Failed to extract product data",
          };
        }
      }),
    extractFromPdf: protectedProcedure
      .input(z.object({
        pdfData: z.string(), // base64 encoded PDF
      }))
      .mutation(async ({ ctx, input }) => {
        const { invokeLLM } = await import("./_core/llm");
        const { PDFParse } = await import("pdf-parse");

        try {
          // Decode base64 PDF to Buffer
          // Strip data URI prefix if present (e.g. "data:application/pdf;base64,")
          const base64Data = input.pdfData.includes(",")
            ? input.pdfData.split(",")[1]
            : input.pdfData;
          const pdfBuffer = Buffer.from(base64Data, "base64");

          // Extract text from PDF using pdf-parse v2 API
          const parser = new PDFParse({ data: pdfBuffer });
          const pdfResult = await parser.getText();
          const pdfText = pdfResult.text;

          if (!pdfText || pdfText.trim().length === 0) {
            return {
              success: false,
              error: "Could not extract any text from the PDF. The file may be image-based — try using a screenshot instead.",
            };
          }

          // Send extracted text to LLM (uses configured provider, typically Ollama)
          const response = await invokeLLM({
            messages: [
              {
                role: "user",
                content: `You are an expert at reading EPA pesticide and agricultural product labels. Extract ALL product information from the following label text.

Return a single flat JSON object (no nested objects) with exactly these keys:
"productName" (string, full product name),
"epaNumber" (string, EPA Registration Number e.g. "524-549"),
"registrant" (string, manufacturer/registrant company),
"activeIngredients" (string, list with percentages e.g. "Glyphosate 48.7%"),
"labelVersion" (string, label version or revision date),
"productType" (string, e.g. "Herbicide", "Insecticide", "Fungicide", "Fertilizer"),
"applicationMethods" (string, e.g. "Ground broadcast, Aerial, Chemigation"),
"modeOfAction" (string, e.g. "Group 9", "EPSP synthase inhibitor"),
"physicalState" (string, e.g. "Liquid", "Granular", "Wettable Powder"),
"formulationType" (string, e.g. "Soluble Concentrate", "Emulsifiable Concentrate"),
"rainfastness" (string, e.g. "Rainfast in 1 hour"),
"toxicTo" (string, e.g. "Toxic to fish and aquatic invertebrates"),
"reEntryInterval" (string, REI e.g. "4 hours"),
"preharvestInterval" (string, PHI e.g. "7 days"),
"maxApplicationsPerSeason" (string),
"maxRatePerSeason" (string),
"methodsAllowed" (string),
"rate" (string),
"diluentAerial" (string),
"diluentGround" (string),
"diluentChemigation" (string),
"ppeInformation" (string, all PPE requirements),
"labelSignalWord" (string, DANGER or WARNING or CAUTION),
"responseNumber" (string, emergency response phone number),
"medicalNumber" (string, medical emergency phone number),
"federallyRestricted" (boolean, true if "RESTRICTED USE PESTICIDE"),
"organicCertifications" (string, OMRI/NOP if mentioned),
"postingRequired" (boolean, true if posting/notification required),
"avoidGrazing" (boolean, true if grazing restrictions mentioned),
"generalNotice" (string, summarize first aid, precautionary statements, environmental hazards, storage/disposal, tank mix notes),
"genericConditions" (string, summarize additional info, special conditions, rotational crop restrictions)

IMPORTANT: Return a FLAT JSON object. Do NOT nest fields inside sub-objects. All keys must be at the top level.
If a field is not found, set it to "" (or false for booleans).

Label text:
${pdfText}`,
              },
            ],
            response_format: {
              type: "json_object",
            },
          });

          let content = response.choices[0]?.message?.content;
          if (!content || typeof content !== "string") {
            return {
              success: false,
              error: "No response from AI",
            };
          }

          // Strip thinking tags that some models (e.g. Qwen3) may include
          content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

          // Extract JSON object if wrapped in markdown code fences or extra text
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            return {
              success: false,
              error: "AI response did not contain valid JSON",
            };
          }

          let extractedData = JSON.parse(jsonMatch[0]);

          // Flatten nested objects — some models group fields under section headers
          const flatData: Record<string, any> = {};
          for (const [key, value] of Object.entries(extractedData)) {
            if (value && typeof value === "object" && !Array.isArray(value)) {
              // Nested object — merge its children into the flat result
              Object.assign(flatData, value);
            } else {
              flatData[key] = value;
            }
          }
          extractedData = flatData;

          return {
            success: true,
            extractedData,
          };
        } catch (error: any) {
          console.error("Error extracting product data from PDF:", error);
          return {
            success: false,
            error: error.message || "Failed to extract product data from PDF",
          };
        }
      }),
    create: protectedProcedure
      .input(z.object({
        productName: z.string(),
        epaNumber: z.string().optional().refine((val) => isValidEpaNumber(val), {
          message: "Invalid EPA Registration Number format. Expected: XXXXX-XXX",
        }),
        registrant: z.string().optional(),
        activeIngredients: z.string().optional(),
        reEntryInterval: z.string().optional(),
        preharvestInterval: z.string().optional(),
        maxApplicationsPerSeason: z.string().optional(),
        maxRatePerSeason: z.string().optional(),
        methodsAllowed: z.string().optional(),
        rate: z.string().optional(),
        diluentAerial: z.string().optional(),
        diluentGround: z.string().optional(),
        diluentChemigation: z.string().optional(),
        ppeInformation: z.string().optional(),
        labelSignalWord: z.string().optional(),
        genericConditions: z.string().optional(),
        // New fields
        labelVersion: z.string().optional(),
        productType: z.string().optional(),
        applicationMethods: z.string().optional(),
        modeOfAction: z.string().optional(),
        physicalState: z.string().optional(),
        formulationType: z.string().optional(),
        toxicTo: z.string().optional(),
        rainfastness: z.string().optional(),
        federallyRestricted: z.boolean().optional(),
        organicCertifications: z.string().optional(),
        postingRequired: z.boolean().optional(),
        avoidGrazing: z.boolean().optional(),
        responseNumber: z.string().optional(),
        medicalNumber: z.string().optional(),
        generalNotice: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getOrCreateUserOrganization, createProduct } = await import("./db");
        const org = await getOrCreateUserOrganization(ctx.user.id);
        const product = await createProduct({ ...input, orgId: org.id });
        return product;
      }),
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const { getProductById } = await import("./db");
        return await getProductById(input.id);
      }),
    search: protectedProcedure
      .input(z.object({ searchTerm: z.string() }))
      .query(async ({ input }) => {
        const { searchProducts } = await import("./db");
        return await searchProducts(input.searchTerm);
      }),
  }),

  // AI Chat router
  ai: router({
    listConversations: protectedProcedure.query(async ({ ctx }) => {
      const { getOrCreateUserOrganization, getConversationsByOrgId } = await import("./db");
      const org = await getOrCreateUserOrganization(ctx.user.id);
      return await getConversationsByOrgId(org.id);
    }),
    createConversation: protectedProcedure
      .input((raw: any) => raw)
      .mutation(async ({ ctx, input }) => {
        const { getOrCreateUserOrganization, createConversation } = await import("./db");
        const org = await getOrCreateUserOrganization(ctx.user.id);
        return await createConversation({ orgId: org.id, userId: ctx.user.id, ...input });
      }),
    getMessages: protectedProcedure
      .input((raw: any) => raw)
      .query(async ({ input }) => {
        const { getMessagesByConversationId } = await import("./db");
        return await getMessagesByConversationId(input.conversationId);
      }),
    sendMessage: protectedProcedure
      .input((raw: any) => raw)
      .mutation(async ({ ctx, input }) => {
        const { createMessage, getOrCreateUserOrganization, getMessagesByConversationId } = await import("./db");
        const { invokeLLM } = await import("./_core/llm");

        const org = await getOrCreateUserOrganization(ctx.user.id);

        // Save user message
        const userMessage = await createMessage({
          conversationId: input.conversationId,
          role: "user",
          content: input.content,
        });

        // Get conversation history
        const history = await getMessagesByConversationId(input.conversationId);
        const messages = history.slice(-10).map((m: any) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));

        // Get AI response using multi-provider LLM (respects LLM_PROVIDER env var)
        try {
          const systemMessage = {
            role: "system" as const,
            content: `You are a helpful agricultural operations assistant for Ready2Spray. You help with job scheduling, weather conditions, EPA compliance, and agricultural operations. Be concise and practical.`,
          };

          const response = await invokeLLM({
            messages: [systemMessage, ...messages],
            maxTokens: 2048,
          });

          let assistantContent = "";

          if (response.choices && response.choices.length > 0) {
            const choice = response.choices[0];
            if (typeof choice.message.content === "string") {
              assistantContent = choice.message.content;
            } else if (Array.isArray(choice.message.content)) {
              assistantContent = choice.message.content
                .map((part: any) => (part.type === "text" ? part.text : ""))
                .join("");
            }
          }

          if (!assistantContent) {
            assistantContent = "I apologize, but I couldn't generate a response. Please try again.";
          }

          // Save assistant message
          const assistantMessage = await createMessage({
            conversationId: input.conversationId,
            role: "assistant",
            content: assistantContent,
          });

          return {
            userMessage,
            assistantMessage,
            usage: response.usage,
          };
        } catch (error: any) {
          console.error('[AI] Error details:', {
            message: error.message,
            stack: error.stack,
            name: error.name,
            cause: error.cause
          });
          // Save error message
          const errorMessage = await createMessage({
            conversationId: input.conversationId,
            role: "assistant",
            content: `I apologize, but I encountered an error: ${error.message}. Please try again.`,
          });
          return { userMessage, assistantMessage: errorMessage };
        }
      }),
    deleteConversation: protectedProcedure
      .input((raw: any) => raw)
      .mutation(async ({ input }) => {
        const { deleteConversation } = await import("./db");
        await deleteConversation(input.conversationId);
        return { success: true };
      }),
  }),

  // Maps router
  maps: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getOrCreateUserOrganization, getMapsByOrgId } = await import("./db");
      const org = await getOrCreateUserOrganization(ctx.user.id);
      return await getMapsByOrgId(org.id);
    }),
    upload: protectedProcedure
      .input((raw: any) => raw)
      .mutation(async ({ ctx, input }) => {
        const { getOrCreateUserOrganization, createMap } = await import("./db");
        const { storagePut } = await import("./storage");
        const org = await getOrCreateUserOrganization(ctx.user.id);

        // Decode base64 and upload to S3
        const base64Data = input.fileData.split(",")[1];
        const buffer = Buffer.from(base64Data, "base64");
        const fileKey = `maps/${org.id}/${Date.now()}-${input.fileName}`;
        const { url } = await storagePut(fileKey, buffer, `application/${input.fileType}`);

        return await createMap({
          orgId: org.id,
          name: input.name,
          fileUrl: url,
          fileKey,
          fileType: input.fileType,
          publicUrl: url,
        });
      }),
    delete: protectedProcedure
      .input((raw: any) => raw)
      .mutation(async ({ input }) => {
        const { deleteMap } = await import("./db");
        await deleteMap(input.id);
        return { success: true };
      }),
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const { getMapById } = await import("./db");
        return await getMapById(input.id);
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { updateMap } = await import("./db");
        const { id, ...data } = input;
        return await updateMap(id, data);
      }),
    saveDrawn: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        kmlContent: z.string(),
        fileSize: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getOrCreateUserOrganization, createMap } = await import("./db");
        const { storagePut } = await import("./storage");
        const org = await getOrCreateUserOrganization(ctx.user.id);

        const buffer = Buffer.from(input.kmlContent, "utf-8");
        const fileKey = `maps/${org.id}/${Date.now()}-${input.name.replace(/[^a-zA-Z0-9]/g, "_")}.kml`;
        const { url } = await storagePut(fileKey, buffer, "application/vnd.google-earth.kml+xml");

        return await createMap({
          orgId: org.id,
          name: input.name,
          fileUrl: url,
          fileKey,
          fileType: "kml",
          publicUrl: url,
        });
      }),
  }),

  // Agrian EPA Product Lookup router
  // Sites router
  equipment: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getOrCreateUserOrganization, getEquipmentByOrgId } = await import("./db");
      const org = await getOrCreateUserOrganization(ctx.user.id);
      return await getEquipmentByOrgId(org.id);
    }),
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const { getOrCreateUserOrganization, getEquipmentById } = await import("./db");
        const org = await getOrCreateUserOrganization(ctx.user.id);
        const item = await getEquipmentById(input.id);
        if (item && item.orgId !== org.id) throw new Error("Not found");
        return item;
      }),
    create: protectedProcedure
      .input(createEquipmentSchema)
      .mutation(async ({ ctx, input }) => {
        const { getOrCreateUserOrganization, createEquipment } = await import("./db");
        const org = await getOrCreateUserOrganization(ctx.user.id);
        return await createEquipment({ ...input, orgId: org.id });
      }),
    update: protectedProcedure
      .input(updateEquipmentSchema)
      .mutation(async ({ ctx, input }) => {
        const { getOrCreateUserOrganization, getEquipmentById, updateEquipment } = await import("./db");
        const org = await getOrCreateUserOrganization(ctx.user.id);
        const existing = await getEquipmentById(input.id);
        if (existing && existing.orgId !== org.id) throw new Error("Not found");
        const { id, ...data } = input;
        return await updateEquipment(id, data);
      }),
    delete: protectedProcedure
      .input(deleteEquipmentSchema)
      .mutation(async ({ ctx, input }) => {
        const { getOrCreateUserOrganization, getEquipmentById, deleteEquipment } = await import("./db");
        const org = await getOrCreateUserOrganization(ctx.user.id);
        const existing = await getEquipmentById(input.id);
        if (existing && existing.orgId !== org.id) throw new Error("Not found");
        await deleteEquipment(input.id);
        return { success: true };
      }),
  }),

  maintenance: router({
    listByEquipment: protectedProcedure
      .input(z.object({ equipmentId: z.number() }))
      .query(async ({ input }) => {
        const { getMaintenanceTasksByEquipmentId } = await import("./db");
        return await getMaintenanceTasksByEquipmentId(input.equipmentId);
      }),
    listAll: protectedProcedure.query(async ({ ctx }) => {
      const { getOrCreateUserOrganization, getAllMaintenanceTasks } = await import("./db");
      const org = await getOrCreateUserOrganization(ctx.user.id);
      return await getAllMaintenanceTasks(org.id);
    }),
    create: protectedProcedure
      .input(z.object({
        equipmentId: z.number(),
        taskName: z.string(),
        description: z.string().optional(),
        taskType: z.enum(["inspection", "oil_change", "filter_replacement", "tire_rotation", "annual_certification", "engine_overhaul", "custom"]),
        frequencyType: z.enum(["hours", "days", "months", "one_time"]),
        frequencyValue: z.number(),
        nextDueDate: z.string().optional(),
        isRecurring: z.boolean().default(true),
        estimatedCost: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { createMaintenanceTask } = await import("./db");
        const { nextDueDate, ...data } = input;
        const taskData = {
          ...data,
          ...(nextDueDate ? { nextDueDate: new Date(nextDueDate) } : {}),
        };
        return await createMaintenanceTask(taskData);
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        taskName: z.string().optional(),
        description: z.string().optional(),
        taskType: z.enum(["inspection", "oil_change", "filter_replacement", "tire_rotation", "annual_certification", "engine_overhaul", "custom"]).optional(),
        frequencyType: z.enum(["hours", "days", "months", "one_time"]).optional(),
        frequencyValue: z.number().optional(),
        nextDueDate: z.string().optional(),
        isRecurring: z.boolean().optional(),
        estimatedCost: z.string().optional(),
        actualCost: z.string().optional(),
        status: z.enum(["pending", "in_progress", "completed", "overdue"]).optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { updateMaintenanceTask } = await import("./db");
        const { id, nextDueDate, ...data } = input;
        const updates = {
          ...data,
          ...(nextDueDate ? { nextDueDate: new Date(nextDueDate) } : {}),
        };
        return await updateMaintenanceTask(id, updates);
      }),
    complete: protectedProcedure
      .input(z.object({
        id: z.number(),
        actualCost: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { completeMaintenanceTask } = await import("./db");
        return await completeMaintenanceTask(input.id, input.actualCost, input.notes);
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const { deleteMaintenanceTask } = await import("./db");
        await deleteMaintenanceTask(input.id);
        return { success: true };
      }),
  }),

  sites: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getOrCreateUserOrganization, getSitesByOrgId } = await import("./db");
      const org = await getOrCreateUserOrganization(ctx.user.id);
      return await getSitesByOrgId(org.id);
    }),
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const { getOrCreateUserOrganization, getSiteById } = await import("./db");
        const org = await getOrCreateUserOrganization(ctx.user.id);
        const site = await getSiteById(input.id);
        if (site && site.orgId !== org.id) throw new Error("Not found");
        return site;
      }),
    create: protectedProcedure
      .input(createSiteSchema)
      .mutation(async ({ ctx, input }) => {
        const { getOrCreateUserOrganization, createSite } = await import("./db");
        const org = await getOrCreateUserOrganization(ctx.user.id);
        // Map GPS coordinates to centerLat/centerLng if provided
        const siteData: any = { ...input, orgId: org.id };
        if (input.latitude && input.longitude) {
          siteData.centerLat = String(input.latitude);
          siteData.centerLng = String(input.longitude);
        }
        delete siteData.latitude;
        delete siteData.longitude;
        return await createSite(siteData);
      }),
    update: protectedProcedure
      .input(updateSiteSchema)
      .mutation(async ({ ctx, input }) => {
        const { getOrCreateUserOrganization, getSiteById, updateSite } = await import("./db");
        const org = await getOrCreateUserOrganization(ctx.user.id);
        const existing = await getSiteById(input.id);
        if (existing && existing.orgId !== org.id) throw new Error("Not found");
        const { id, ...data } = input;
        return await updateSite(id, data);
      }),
    delete: protectedProcedure
      .input(deleteSiteSchema)
      .mutation(async ({ ctx, input }) => {
        const { getOrCreateUserOrganization, getSiteById, deleteSite } = await import("./db");
        const org = await getOrCreateUserOrganization(ctx.user.id);
        const existing = await getSiteById(input.id);
        if (existing && existing.orgId !== org.id) throw new Error("Not found");
        await deleteSite(input.id);
        return { success: true };
      }),
    getJobHistory: protectedProcedure
      .input(z.object({ siteId: z.number() }))
      .query(async ({ input }) => {
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) return [];
        const { jobs } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        return await db.select().from(jobs).where(eq(jobs.siteId, input.siteId));
      }),
    downloadKML: protectedProcedure
      .input(z.object({ siteId: z.number() }))
      .query(async ({ input }) => {
        const { getSiteById } = await import("./db");
        const { generateKMLFromGeoJSON } = await import("./kmlGenerator");
        const site = await getSiteById(input.siteId);
        if (!site) throw new Error("Property not found");
        if (!site.polygon) throw new Error("Property has no polygon boundary");
        const kml = generateKMLFromGeoJSON(site.polygon, site.name, {
          name: site.name,
          description: `${site.siteType} - ${site.address || "No address"}`,
        });
        return { kml, filename: `${site.name.replace(/[^a-zA-Z0-9]/g, "_")}.kml` };
      }),
  }),

  agrian: router({
    searchProducts: protectedProcedure
      .input((raw: any) => raw)
      .query(async ({ input }) => {
        const { searchAgrianProducts } = await import("./agrian");
        return await searchAgrianProducts(input);
      }),
    getProductDetail: protectedProcedure
      .input((raw: any) => raw)
      .query(async ({ input }) => {
        const { getAgrianProductDetail } = await import("./agrian");
        return await getAgrianProductDetail(input.url, input.state, input.commodity);
      }),
  }),

  // Service Plans router
  servicePlans: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getOrCreateUserOrganization, getServicePlansByOrgId } = await import("./db");
      const org = await getOrCreateUserOrganization(ctx.user.id);
      return await getServicePlansByOrgId(org.id);
    }),
    create: protectedProcedure
      .input(z.object({
        customerId: z.number().min(1, "Customer is required"),
        siteId: z.number().optional(),
        planName: z.string().min(1, "Plan name is required"),
        planType: z.enum(["monthly", "quarterly", "bi_monthly", "annual", "one_off"]),
        startDate: z.string().min(1, "Start date is required"),
        endDate: z.string().optional(),
        nextServiceDate: z.string().optional(),
        defaultZones: z.string().optional(), // JSON string
        defaultProducts: z.string().optional(), // JSON string
        defaultTargetPests: z.string().optional(), // JSON string
        pricePerService: z.string().optional(),
        currency: z.string().default("USD"),
        status: z.enum(["active", "paused", "cancelled", "completed"]).default("active"),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getOrCreateUserOrganization, createServicePlan } = await import("./db");
        const org = await getOrCreateUserOrganization(ctx.user.id);
        return await createServicePlan({
          orgId: org.id,
          ...input,
          defaultZones: input.defaultZones ? JSON.parse(input.defaultZones) : null,
          defaultProducts: input.defaultProducts ? JSON.parse(input.defaultProducts) : null,
          defaultTargetPests: input.defaultTargetPests ? JSON.parse(input.defaultTargetPests) : null,
        });
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        customerId: z.number().optional(),
        siteId: z.number().optional(),
        planName: z.string().min(1, "Plan name is required").optional(),
        planType: z.enum(["monthly", "quarterly", "bi_monthly", "annual", "one_off"]).optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        nextServiceDate: z.string().optional(),
        defaultZones: z.string().optional(), // JSON string
        defaultProducts: z.string().optional(), // JSON string
        defaultTargetPests: z.string().optional(), // JSON string
        pricePerService: z.string().optional(),
        currency: z.string().optional(),
        status: z.enum(["active", "paused", "cancelled", "completed"]).optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { updateServicePlan } = await import("./db");
        const { id, ...rest } = input;
        return await updateServicePlan(id, {
          ...rest,
          defaultZones: rest.defaultZones ? JSON.parse(rest.defaultZones) : undefined,
          defaultProducts: rest.defaultProducts ? JSON.parse(rest.defaultProducts) : undefined,
          defaultTargetPests: rest.defaultTargetPests ? JSON.parse(rest.defaultTargetPests) : undefined,
        });
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const { deleteServicePlan } = await import("./db");
        await deleteServicePlan(input.id);
        return { success: true };
      }),
    processNow: protectedProcedure
      .mutation(async ({ ctx }) => {
        const { user } = ctx;
        // Only allow admin/owner users to trigger processing
        if (user.userRole !== 'admin' && user.userRole !== 'owner' && user.role !== 'admin') {
          throw new Error('Only administrators can trigger service plan processing');
        }
        const { triggerServicePlanProcessing } = await import("./servicePlanScheduler");
        const result = await triggerServicePlanProcessing();
        return result;
      }),
  }),
  // Audit Log router
  auditLogs: router({
    list: protectedProcedure
      .input(z.object({
        userId: z.number().optional(),
        action: z.enum(["create", "update", "delete", "login", "logout", "role_change", "status_change", "export", "import", "view"]).optional(),
        entityType: z.enum(["user", "customer", "personnel", "job", "site", "equipment", "product", "service_plan", "maintenance_task", "organization", "integration", "job_status"]).optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const { getOrCreateUserOrganization, getAuditLogs } = await import("./db");
        const org = await getOrCreateUserOrganization(ctx.user.id);
        
        const filters = input ? {
          ...input,
          startDate: input.startDate ? new Date(input.startDate) : undefined,
          endDate: input.endDate ? new Date(input.endDate) : undefined,
        } : undefined;
        
        return await getAuditLogs(org.id, filters);
      }),
    
    getByEntity: protectedProcedure
      .input(z.object({
        entityType: z.enum(["user", "customer", "personnel", "job", "site", "equipment", "product", "service_plan", "maintenance_task", "organization", "integration", "job_status"]),
        entityId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        const { getOrCreateUserOrganization, getAuditLogsByEntity } = await import("./db");
        const org = await getOrCreateUserOrganization(ctx.user.id);
        return await getAuditLogsByEntity(org.id, input.entityType, input.entityId);
      }),
    
    create: protectedProcedure
      .input(z.object({
        action: z.enum(["create", "update", "delete", "login", "logout", "role_change", "status_change", "export", "import", "view"]),
        entityType: z.enum(["user", "customer", "personnel", "job", "site", "equipment", "product", "service_plan", "maintenance_task", "organization", "integration", "job_status"]),
        entityId: z.number().optional(),
        entityName: z.string().optional(),
        changes: z.any().optional(),
        metadata: z.any().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getOrCreateUserOrganization, createAuditLog } = await import("./db");
        const org = await getOrCreateUserOrganization(ctx.user.id);
        
        // Get IP address and user agent from request
        const ipAddress = ctx.req.ip || ctx.req.socket.remoteAddress || null;
        const userAgent = ctx.req.headers['user-agent'] || null;
        
        return await createAuditLog({
          organizationId: org.id,
          userId: ctx.user.id,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId || null,
          entityName: input.entityName || null,
          changes: input.changes || null,
          ipAddress,
          userAgent,
          metadata: input.metadata || null,
        });
      }),
  }),
  
  // User Management router
  users: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getOrCreateUserOrganization, getUsersByOrgId } = await import("./db");
      const org = await getOrCreateUserOrganization(ctx.user.id);
      return await getUsersByOrgId(org.id);
    }),
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1, "Name is required"),
        email: z.string().email("Invalid email format"),
        userRole: z.enum(["admin", "manager", "technician", "pilot", "sales"]),
      }))
      .mutation(async ({ input, ctx }) => {
        // Only admins can create users
        if (ctx.user.userRole !== 'admin') {
          throw new Error('Only administrators can create users');
        }
        const { createUser } = await import("./db");
        const user = await createUser(input);
        return user;
      }),
    updateRole: protectedProcedure
      .input(z.object({
        userId: z.number(),
        userRole: z.enum(["admin", "manager", "technician", "pilot", "sales"]),
      }))
      .mutation(async ({ input, ctx }) => {
        // Only admins can update roles
        if (ctx.user.userRole !== 'admin') {
          throw new Error('Only administrators can update user roles');
        }
        const { updateUserRole } = await import("./db");
        await updateUserRole(input.userId, input.userRole);
        return { success: true };
      }),
  }),

  // Jobs V2 router - Comprehensive job management
  jobsV2: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getOrCreateUserOrganization, getJobsV2WithRelations } = await import("./db");
      const org = await getOrCreateUserOrganization(ctx.user.id);
      return await getJobsV2WithRelations(org.id);
    }),
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const { getOrCreateUserOrganization, getJobV2WithProduct } = await import("./db");
        const org = await getOrCreateUserOrganization(ctx.user.id);
        const job = await getJobV2WithProduct(input.id);
        if (job && job.orgId !== org.id) throw new Error("Not found");
        return job;
      }),
    create: protectedProcedure
      .input(z.object({
        title: z.string().min(1, "Job title is required"),
        description: z.string().optional(),
        jobType: z.enum(["crop_dusting", "pest_control", "fertilization", "herbicide"]).optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
        status: z.enum(["pending", "ready", "in_progress", "completed", "cancelled"]).optional(),
        customerId: z.number().optional(),
        personnelId: z.number().optional(),
        equipmentId: z.number().optional(),
        location: z.string().optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        scheduledStart: z.string().optional(), // ISO date string
        scheduledEnd: z.string().optional(), // ISO date string
      }))
      .mutation(async ({ ctx, input }) => {
        const { getOrCreateUserOrganization, createJobV2, ensureDefaultJobStatuses, getDefaultJobStatus } = await import("./db");
        const org = await getOrCreateUserOrganization(ctx.user.id);

        // Ensure default statuses exist, then resolve the status ID
        await ensureDefaultJobStatuses(org.id);
        const defaultStatus = await getDefaultJobStatus(org.id);
        const statusId = defaultStatus?.id ?? null;

        return await createJobV2({
          orgId: org.id,
          title: input.title,
          description: input.description || null,
          jobType: input.jobType || "crop_dusting",
          priority: input.priority || "medium",
          statusId,
          customerId: input.customerId || null,
          assignedPersonnelId: input.personnelId || null,
          equipmentId: input.equipmentId || null,
          locationAddress: input.location || null,
          locationLat: input.latitude ? input.latitude.toString() : null,
          locationLng: input.longitude ? input.longitude.toString() : null,
          scheduledStart: input.scheduledStart ? new Date(input.scheduledStart) : null,
          scheduledEnd: input.scheduledEnd ? new Date(input.scheduledEnd) : null,
        });
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().min(1, "Job title is required").optional(),
        description: z.string().optional(),
        jobType: z.enum(["crop_dusting", "pest_control", "fertilization", "herbicide"]).optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
        status: z.enum(["pending", "ready", "in_progress", "completed", "cancelled"]).optional(),
        customerId: z.number().nullable().optional(),
        personnelId: z.number().nullable().optional(),
        equipmentId: z.number().nullable().optional(),
        location: z.string().nullable().optional(),
        latitude: z.number().nullable().optional(),
        longitude: z.number().nullable().optional(),
        scheduledStart: z.string().nullable().optional(),
        scheduledEnd: z.string().nullable().optional(),
        treatmentPolygon: z.any().nullable().optional(),
        acres: z.number().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getOrCreateUserOrganization, getJobV2WithProduct, updateJobV2 } = await import("./db");
        const org = await getOrCreateUserOrganization(ctx.user.id);
        const existing = await getJobV2WithProduct(input.id);
        if (existing && existing.orgId !== org.id) throw new Error("Not found");
        const { id, ...updates } = input;
        return await updateJobV2(id, {
          ...updates,
          scheduledStart: updates.scheduledStart ? new Date(updates.scheduledStart) : undefined,
          scheduledEnd: updates.scheduledEnd ? new Date(updates.scheduledEnd) : undefined,
        });
      }),
    linkProduct: protectedProcedure
      .input(z.object({
        jobId: z.number(),
        productId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getOrCreateUserOrganization, getJobV2WithProduct, updateJobV2Product } = await import("./db");
        const org = await getOrCreateUserOrganization(ctx.user.id);
        const existing = await getJobV2WithProduct(input.jobId);
        if (existing && existing.orgId !== org.id) throw new Error("Not found");
        return await updateJobV2Product(input.jobId, input.productId);
      }),
    // Dropdown data endpoints
    getCustomers: protectedProcedure.query(async ({ ctx }) => {
      const { getOrCreateUserOrganization, getCustomersByOrgId } = await import("./db");
      const org = await getOrCreateUserOrganization(ctx.user.id);
      return await getCustomersByOrgId(org.id);
    }),
    getPersonnel: protectedProcedure.query(async ({ ctx }) => {
      const { getOrCreateUserOrganization, getPersonnelByOrgId } = await import("./db");
      const org = await getOrCreateUserOrganization(ctx.user.id);
      return await getPersonnelByOrgId(org.id);
    }),
    getEquipment: protectedProcedure.query(async ({ ctx }) => {
      const { getOrCreateUserOrganization, getEquipmentByOrgId } = await import("./db");
      const org = await getOrCreateUserOrganization(ctx.user.id);
      return await getEquipmentByOrgId(org.id);
    }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { getOrCreateUserOrganization, getJobV2WithProduct, deleteJobV2 } = await import("./db");
        const org = await getOrCreateUserOrganization(ctx.user.id);
        const existing = await getJobV2WithProduct(input.id);
        if (existing && existing.orgId !== org.id) throw new Error("Not found");
        return await deleteJobV2(input.id);
      }),
    // Map Files endpoints
    uploadMapFile: protectedProcedure
      .input(z.object({
        jobId: z.number(),
        name: z.string(),
        fileType: z.enum(["kml", "gpx", "geojson"]),
        fileContent: z.string(), // Base64 encoded file content
        fileSize: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          const { getOrCreateUserOrganization, createMapFile } = await import("./db");
          const { storagePut } = await import("./storage");
          const org = await getOrCreateUserOrganization(ctx.user.id);
          
          // Decode base64 and upload to S3
          const fileBuffer = Buffer.from(input.fileContent, 'base64');
          const fileKey = `org-${org.id}/jobs/${input.jobId}/maps/${Date.now()}-${input.name}`;
          const { url } = await storagePut(fileKey, fileBuffer, `application/${input.fileType}`);
          
          console.log('[uploadMapFile] About to insert:', {
            jobId: input.jobId,
            orgId: org.id,
            name: input.name,
            fileType: input.fileType,
            fileUrl: url,
            fileKey,
            fileSize: input.fileSize,
            uploadedBy: ctx.user.id,
          });
          
          const result = await createMapFile({
            jobId: input.jobId,
            orgId: org.id,
            name: input.name,
            fileType: input.fileType,
            fileUrl: url,
            fileKey,
            fileSize: input.fileSize,
            uploadedBy: ctx.user.id,
          });
          
          console.log('[uploadMapFile] Insert successful:', result);
          return result;
        } catch (error) {
          console.error('[uploadMapFile] ERROR:', error);
          console.error('[uploadMapFile] Error stack:', error instanceof Error ? error.stack : 'No stack');
          console.error('[uploadMapFile] Error message:', error instanceof Error ? error.message : String(error));
          throw error;
        }
      }),
    getMapFiles: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .query(async ({ input }) => {
        const { getMapFilesByJobId } = await import("./db");
        return await getMapFilesByJobId(input.jobId);
      }),
    deleteMapFile: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const { deleteMapFile } = await import("./db");
        // TODO: Also delete from S3 using fileKey
        return await deleteMapFile(input.id);
      }),
  }),

  // Dashboard router
  dashboard: router({
    summary: protectedProcedure.query(async ({ ctx }) => {
      const { getOrCreateUserOrganization, getJobsByOrgId, getCustomersByOrgId, getPersonnelByOrgId, getEquipmentByOrgId } = await import("./db");
      const org = await getOrCreateUserOrganization(ctx.user.id);
      
      // Get all data in parallel
      const [jobs, customers, personnel, equipment] = await Promise.all([
        getJobsByOrgId(org.id),
        getCustomersByOrgId(org.id),
        getPersonnelByOrgId(org.id),
        getEquipmentByOrgId(org.id),
      ]);
      
      // Count jobs by status
      const statusCounts = jobs.reduce((acc: Record<string, number>, job: any) => {
        const status = job.status || 'pending';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {});
      
      // Get recent jobs (limit 5)
      const recentJobs = jobs
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5);
      
      return {
        jobCount: jobs.length,
        customerCount: customers.length,
        personnelCount: personnel.length,
        equipmentCount: equipment.length,
        statusCounts,
        recentJobs,
      };
    }),
  }),

  // API Key Management
  apiKeys: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getOrCreateUserOrganization, getApiKeysByOrgId } = await import("./db");
      const org = await getOrCreateUserOrganization(ctx.user.id);
      return await getApiKeysByOrgId(org.id);
    }),
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1, "Name is required"),
        description: z.string().optional(),
        permissions: z.array(z.string()),
        expiresAt: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getOrCreateUserOrganization, createApiKey } = await import("./db");
        const bcrypt = await import("bcrypt");
        const crypto = await import("crypto");
        
        const org = await getOrCreateUserOrganization(ctx.user.id);
        
        // Generate API key: rts_live_<random>
        const randomBytes = crypto.randomBytes(32).toString("hex");
        const apiKey = `rts_live_${randomBytes}`;
        const keyHash = await bcrypt.hash(apiKey, 10);
        const keyPrefix = apiKey.substring(0, 12); // rts_live_xxx
        
        const newKey = await createApiKey({
          organizationId: org.id,
          name: input.name,
          description: input.description,
          keyHash,
          keyPrefix,
          permissions: input.permissions,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          createdBy: ctx.user.id,
        });
        
        // Return the plain key only once
        return { ...newKey, plainKey: apiKey };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const { deleteApiKey } = await import("./db");
        await deleteApiKey(input.id);
        return { success: true };
      }),
  }),

  // Job Sharing
  jobShares: router({
    list: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .query(async ({ ctx, input }) => {
        const { getOrCreateUserOrganization, getJobV2WithProduct, getJobSharesByJobId } = await import("./db");
        const org = await getOrCreateUserOrganization(ctx.user.id);
        const job = await getJobV2WithProduct(input.jobId);
        if (job && job.orgId !== org.id) throw new Error("Not found");
        return await getJobSharesByJobId(input.jobId);
      }),
    create: protectedProcedure
      .input(z.object({
        jobId: z.number(),
        title: z.string().optional(),
        expiresAt: z.string().optional(),
        allowDownloads: z.boolean().default(true),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getOrCreateUserOrganization, getJobV2WithProduct, createJobShare } = await import("./db");
        const org = await getOrCreateUserOrganization(ctx.user.id);
        const job = await getJobV2WithProduct(input.jobId);
        if (job && job.orgId !== org.id) throw new Error("Not found");
        const crypto = await import("crypto");

        const shareToken = crypto.randomBytes(32).toString("hex");

        return await createJobShare({
          jobId: input.jobId,
          shareToken,
          title: input.title,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          allowDownloads: input.allowDownloads,
          createdBy: ctx.user.id,
        });
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { getOrCreateUserOrganization, deleteJobShare } = await import("./db");
        const org = await getOrCreateUserOrganization(ctx.user.id);
        // TODO: verify share belongs to a job owned by this org
        await deleteJobShare(input.id);
        return { success: true };
      }),
    getByToken: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const { getJobShareByToken, updateJobShareAccess, getJobById } = await import("./db");
        
        const share = await getJobShareByToken(input.token);
        if (!share) {
          throw new Error("Share not found");
        }
        
        if (!share.isActive) {
          throw new Error("Share has been revoked");
        }
        
        if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
          throw new Error("Share has expired");
        }
        
        // Update access tracking
        await updateJobShareAccess(share.id);
        
        // Get job details
        const job = await getJobById(share.jobId);
        
        return { share, job };
      }),
  }),
});

export type AppRouter = typeof appRouter;
