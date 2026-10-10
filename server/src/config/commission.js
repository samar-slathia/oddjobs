/**
 * OddKar Platform Commission Configuration & Calculation Engine
 * 
 * Enforces server-side validated commission rate (default: 20%).
 * Performs deterministic integer-paise arithmetic.
 * Ensures materials are strictly excluded from the commission base.
 */

const getPlatformCommissionPercentage = () => {
  const envVal = process.env.PLATFORM_COMMISSION_PERCENTAGE;
  if (envVal === undefined || envVal === null || envVal === '') {
    return 20; // Default standard commission 20%
  }
  const parsed = Number(envVal);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new Error(
      `Invalid PLATFORM_COMMISSION_PERCENTAGE configuration: '${envVal}'. Must be a number between 0 and 100.`
    );
  }
  return parsed;
};

/**
 * Validates commission config on server startup.
 */
const validateCommissionConfigOnStartup = () => {
  const rate = getPlatformCommissionPercentage();
  return rate;
};

/**
 * Calculates commission and provider earnings in integer paise.
 * 
 * @param {Object} params
 * @param {number} params.labourAmountPaise - Commissionable service/labour amount in paise.
 * @param {number} [params.materialsAmountPaise=0] - Non-commissionable materials amount in paise.
 * @param {number} [params.commissionRate] - Snapshot percentage (0-100). Defaults to current config.
 * @param {boolean} [params.isFreeInspection=false] - Whether this is a free-inspection promotion.
 * @param {boolean} [params.hasApprovedQuote=false] - Whether subsequent repair quote was approved by customer.
 * @param {number} [params.standardInspectionFeePaise=9900] - Standard inspection fee in paise.
 * @returns {Object} Auditable calculation breakdown in integer paise.
 */
const calculateCommissionAndEarnings = ({
  labourAmountPaise = 0,
  materialsAmountPaise = 0,
  commissionRate,
  isFreeInspection = false,
  hasApprovedQuote = false,
  standardInspectionFeePaise = 9900,
}) => {
  const effectiveRate =
    commissionRate !== undefined && commissionRate !== null
      ? commissionRate
      : getPlatformCommissionPercentage();

  if (!Number.isFinite(effectiveRate) || effectiveRate < 0 || effectiveRate > 100) {
    throw new Error(`Invalid commission rate snapshot: '${effectiveRate}'. Must be between 0 and 100.`);
  }

  // Ensure integer inputs
  const labourPaise = Math.round(Number(labourAmountPaise) || 0);
  const materialsPaise = Math.round(Number(materialsAmountPaise) || 0);

  if (labourPaise < 0 || materialsPaise < 0) {
    throw new Error('Monetary amounts in paise cannot be negative.');
  }

  let commissionBasePaise = labourPaise;
  let customerChargePaise = labourPaise + materialsPaise;
  let waivedAmountPaise = 0;
  let promotionalSubsidyPaise = 0;

  if (isFreeInspection) {
    if (hasApprovedQuote) {
      // Free inspection promo applied to the diagnostic phase of the job.
      // Subsequent approved repair work is NOT free or subsidized:
      // Customer is charged in full for approved repair quote (labour + materials).
      // Platform subsidy on approved repair quote is 0.
      waivedAmountPaise = 0;
      promotionalSubsidyPaise = 0;
      customerChargePaise = labourPaise + materialsPaise;
    } else {
      // Diagnostic-only inspection:
      // The platform subsidy is strictly capped at standardInspectionFeePaise (default ₹99.00 / 9900 paise).
      const subsidyCap = Math.max(0, Math.round(Number(standardInspectionFeePaise) || 9900));
      const diagnosticLabourPaise = Math.min(labourPaise, subsidyCap);

      waivedAmountPaise = diagnosticLabourPaise;
      promotionalSubsidyPaise = diagnosticLabourPaise;
      // Customer pays any excess labour beyond subsidy cap + materials
      customerChargePaise = (labourPaise - diagnosticLabourPaise) + materialsPaise;
    }
  }

  // Calculate platform commission on commissionBase (labour only, materials excluded!)
  const commissionPaise = Math.round((commissionBasePaise * effectiveRate) / 100);

  // Net provider earning = (labour - commission) + materials reimbursement
  const netProviderEarningPaise = (commissionBasePaise - commissionPaise) + materialsPaise;

  return {
    commissionRate: effectiveRate,
    labourPaise,
    materialsPaise,
    commissionBasePaise,
    commissionPaise,
    customerChargePaise,
    waivedAmountPaise,
    promotionalSubsidyPaise,
    netProviderEarningPaise,
  };
};

module.exports = {
  getPlatformCommissionPercentage,
  validateCommissionConfigOnStartup,
  calculateCommissionAndEarnings,
};
