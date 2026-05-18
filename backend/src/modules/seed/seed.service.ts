import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { P2pVendor } from '../../database/entities/p2p-vendor.entity';
import { ErpVendor } from '../../database/entities/erp-vendor.entity';

/**
 * Seeds realistic Indira IVF vendor data on first boot. Idempotent — skipped
 * if any vendors already exist. Includes engineered discrepancies covering all
 * 9 reconciliation categories so the dashboard has meaningful exceptions to
 * triage out of the box.
 */
@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(P2pVendor) private readonly p2pRepo: Repository<P2pVendor>,
    @InjectRepository(ErpVendor) private readonly erpRepo: Repository<ErpVendor>,
  ) {}

  async onApplicationBootstrap() {
    if ((await this.p2pRepo.count()) > 0) {
      this.logger.log('Seed skipped — vendors already present.');
      return;
    }
    this.logger.log('Seeding realistic Indira IVF vendor data...');
    const now = new Date();

    // -------- P2P vendors (clean records) --------
    const p2pData = [
      p('2000016615', 'Dr Shalini Tondon',                  'Varanasi',  'Uttar Pradesh', '221001', 'Professional Fees',       'Professional Fees (Doctors / Clinical)', 'Net 15', 'ABEPT6987A', null,                null,                       null,                              null,             null,            null),
      p('2000016647', 'Biospan Remedies',                   'Pune',      'Maharashtra',   '411004', 'CREDITORS FOR PURCHASES', 'Pharmacy & Medical Supplies',            'Net 15', 'ABFPM2795L', '27ABFPM2795L1Z3',   'UDYAM-MH-26-0053026',     'Purchase of Goods 0.1',           '50100123456789', 'HDFC0001234',  'HDFC Bank'),
      p('2000016664', 'Dr Shivram Prakash Ramarao',         'Pune',      'Maharashtra',   '411015', 'Professional Fees',       'Professional Fees (Doctors / Clinical)', 'Net 15', 'AZJPS8765N', null,                null,                       'Professional Fees 10',            null,             null,            null),
      p('2000016709', 'Drip And Dry',                       'Patna',     'Bihar',         '801506', 'Services',                'Other Expenses',                          'Net 15', 'BJOPK0547A', '10BJOPK0547A1ZU',   null,                       'Contract 1',                       '50100987654321', 'ICIC0009876',  'ICICI Bank'),
      p('2000016761', 'Shree Enterprises-Prayagraj',        'Prayagraj', 'Uttar Pradesh', '211001', 'CREDITORS FOR PURCHASES', 'Pharmacy & Medical Supplies',            'Net 15', 'DNQPK0485K', '09DNQPK0485K1ZB',   null,                       'Purchase of Goods 0.1',           '50100345678912', 'SBIN0003456',  'State Bank of India'),
      p('2000016772', 'Dr Swapnil Dilip Jadhav',            'Jalna',     'Maharashtra',   '431211', 'Professional Fees',       'Professional Fees (Doctors / Clinical)', 'Net 15', 'AZYPJ0606N', null,                null,                       'Professional Fees 10',            null,             null,            null),
      p('2000016789', 'Gupta Medical Agencies',             'Varanasi',  'Uttar Pradesh', '221003', 'CREDITORS FOR PURCHASES', 'Pharmacy & Medical Supplies',            'Net 15', 'AZGPG0303H', '09AZGPG0303H1ZU',   null,                       'Purchase of Goods 0.1',           '40100456789123', 'PUNB0401900',  'Punjab National Bank'),
      p('2000016795', 'Prayagraj Lion Waste Management',    'Prayagraj', 'Uttar Pradesh', '211002', 'Services',                'Other Expenses',                          'Net 15', 'AALCP6814D', '09AALCP6814D1ZA',   null,                       'Contract 2',                       '60100567891234', 'AXIS0006789',  'Axis Bank'),
      p('2000016937', 'Aark Pharmaceuticals Pvt Ltd',       'Chandigarh','Chandigarh',    '160036', 'CREDITORS FOR PURCHASES', 'Pharmacy & Medical Supplies',            'Net 15', 'AAJCA1234F', '04AAJCA1234F1Z5',   'UDYAM-CH-01-0001234',     'Purchase of Goods 0.1',           '70100678912345', 'HDFC0007890',  'HDFC Bank'),
      p('2000016952', 'Space N Time Creation',              'Gwalior',   'Madhya Pradesh','474012', 'Services',                'Marketing & Advertisement',               'Net 15', 'ADYPT8049F', '23ADYPT8049F1ZV',   'UDYAM-MP-20-0076459',     'Contract 2',                       '80100789123456', 'KKBK0008888',  'Kotak Mahindra Bank'),
      p('2000016962', 'Shree Maa Distributors',             'Patna',     'Bihar',         '801503', 'CREDITORS FOR PURCHASES', 'Pharmacy & Medical Supplies',            'Net 15', 'AFLPG5203R', '10AFLPG5203R1ZH',   'UDYAM-BR-26-0029046',     'Purchase of Goods 0.1',           '90100891234567', 'YESB0009999',  'Yes Bank'),
      p('2000016989', 'Dr Vandana Mishra',                  'Patna',     'Bihar',         '801503', 'Professional Fees',       'Professional Fees (Doctors / Clinical)', 'Net 15', 'APIPM0147H', null,                null,                       'Professional Fees 10',            null,             null,            null),
      // ---------- engineered discrepancy fixtures ----------
      p('2000017055', 'Dr Bheemarao Revappa Kambale',       'Solapur',   'Maharashtra',   '413006', 'Professional Fees',       'Professional Fees (Doctors / Clinical)', 'Net 15', 'BMOPK8507R', null,                null,                       'Professional Fees 10',            '11100912345678', 'CNRB0001112',  'Canara Bank'),
      p('2000017058', 'Dr Vinayak Wamanrao Deshpande',      'Sindhudurg','Maharashtra',   '416602', 'Professional Fees',       'Professional Fees (Doctors / Clinical)', 'Net 15', 'AQYPD6548E', null,                null,                       'Professional Fees 10',            '12100123456789', 'BARB0SINDHU',  'Bank of Baroda'),
      p('2000017060', 'Dr Rupak Santosh Pardeshi',          'Ahmednagar','Maharashtra',   '414003', 'Professional Fees',       'Professional Fees (Doctors / Clinical)', 'Net 15', 'DKBPP0112C', null,                null,                       'Professional Fees 10',            '13100234567891', 'IDBI0013100',  'IDBI Bank'),
      p('2000017074', 'Shreya Shukla-MCWPL00133',           'Prayagraj', 'Uttar Pradesh', '211001', 'Services',                'Employees',                               'Net 15', 'MXHPS9432G', null,                null,                       'Salary 0',                          null,             null,            null),
      p('2000017075', 'Niti Pradhan-MCWPL00082',            'Prayagraj', 'Uttar Pradesh', '211001', 'Services',                'Employees',                               'Net 15', 'BNLPP8679P', null,                null,                       'Salary 0',                          null,             null,            null),
      // P2P only — Missing-in-ERP CRITICAL exceptions
      p('2000017101', 'New Horizons Lab Solutions Pvt Ltd', 'Mumbai',    'Maharashtra',   '400093', 'CREDITORS FOR PURCHASES', 'IVF Consumables',                          'Net 30', 'AABCN5432P', '27AABCN5432P1Z7',   'UDYAM-MH-19-9999999',     'Purchase of Goods 0.1',           '14100345678912', 'HDFC0009999',  'HDFC Bank'),
      p('2000017102', 'Cooper Surgical India Pvt Ltd',      'Bengaluru', 'Karnataka',     '560001', 'CREDITORS FOR PURCHASES', 'IVF Consumables',                          'Net 30', 'AABCC9876B', '29AABCC9876B1Z9',   'UDYAM-KR-03-0123456',     'Purchase of Goods 0.1',           '15100456789123', 'SBIN0001122',  'State Bank of India'),
      p('2000017103', 'Vitrolife Sweden AB India Branch',   'Mumbai',    'Maharashtra',   '400001', 'CREDITORS FOR PURCHASES', 'Culture Media',                            'Net 60', 'AAACV5678E', '27AAACV5678E1Z4',   null,                       'Purchase of Goods 0.1',           '16100567891234', 'AXIS0003344',  'Axis Bank'),
    ];

    for (const v of p2pData) {
      await this.p2pRepo.save(this.p2pRepo.create({ ...v, lastSyncedAt: now }));
    }

    // -------- ERP records — derived from P2P with engineered mismatches --------
    // Indices: 0..11 clean. 12=IFSC mismatch. 13=TDS missing+bank acc mismatch.
    // 14=bank name mismatch. 15=name spelling differs. 16=PAN mismatch.
    // 17 (2000017101) NOT in ERP → MISSING_IN_ERP. 18 clean. 19=GST+MSME mismatch.
    const erpData: any[] = [];
    p2pData.forEach((v, i) => {
      // Skip 2000017101 (deliberately absent from ERP)
      if (v.vendorCode === '2000017101') return;

      const e = e2(v);
      if (i === 12) e.ifscCode = 'CNRB0009999';                                    // IFSC mismatch
      if (i === 13) { e.withholdTaxGroup = null; e.bankAccount = '99999999999'; } // TDS missing + bank acc
      if (i === 14) e.bankName = 'IDBI Bank Ltd';                                  // Bank name mismatch
      if (i === 15) e.vendorName = 'Shreya Shukla MCWPL00133';                     // Name spelling differs
      if (i === 16) e.panNumber = 'BNLPP8679X';                                    // PAN mismatch
      if (i === 19) { e.gstNumber = '27AAACV5678E1Z9'; e.msmeNumber = 'UDYAM-MH-19-1111111'; } // GST + MSME mismatch
      erpData.push(e);
    });

    // ERP-only vendors (Missing-in-P2P)
    erpData.push(e3('2000099001', 'Legacy Vendor (Pre-P2P Era)', 'Pune',  'Maharashtra', '411001', 'AABCL0001Z', '27AABCL0001Z1Z0', null,                       '17100912345678', 'HDFC0000001', 'HDFC Bank',   'Purchase of Goods 0.1'));
    erpData.push(e3('2000099002', 'Inactive Old Supplier',       'Delhi', 'Delhi',       '110001', 'BBCDE2345F', '07BBCDE2345F1Z2', null,                       '18100123456789', 'ICIC0001111', 'ICICI Bank',  'Purchase of Goods 0.1'));

    for (const v of erpData) {
      await this.erpRepo.save(this.erpRepo.create({ ...v, lastSyncedAt: now }));
    }
    this.logger.log(`✅ Seeded ${p2pData.length} P2P + ${erpData.length} ERP vendors with engineered discrepancies`);
  }
}

// ---------- helpers ----------

function p(
  vendorCode: string, vendorName: string, city: string, state: string, pincode: string,
  vendorType: string, vendorGroup: string, payTerm: string,
  panNumber: string | null, gstNumber: string | null, msmeNumber: string | null,
  tdsSection: string | null, bankAccount: string | null, ifscCode: string | null,
  bankName: string | null,
) {
  return {
    vendorCode, vendorName, city, state, pincode, country: 'India',
    vendorType, vendorGroup, payTerm,
    activeStatus: 'Yes', hold: 'None',
    panNumber, gstNumber, msmeNumber,
    tdsSection, bankAccount, ifscCode, bankName,
    address: `${city}, ${state}`,
    approvalStatus: 'Approved',
    createdByErp: 'KASTURI_M',
    approvedByErp: 'RAJENDRA_00008',
  };
}

/** Build an ERP record from a P2P seed object — same vendor, ERP-style fields */
function e2(p: any) {
  return {
    vendorCode: p.vendorCode,
    vendorName: p.vendorName,
    taxOrgType: 'INDIVIDUAL',
    vendorTypeLookupCode: p.vendorType,
    status: 'Active',
    msmeCategory: p.msmeNumber ? 'Small' : null,
    msmeNumber: p.msmeNumber,
    gstNumber: p.gstNumber,
    panNumber: p.panNumber,
    withholdTaxGroup: p.tdsSection,
    paymentMethodCode: 'EFT',
    bankAccount: p.bankAccount,
    bankName: p.bankName,
    bankBranchName: p.ifscCode,
    ifscCode: p.ifscCode,
    address: p.address,
    city: p.city,
    state: p.state,
    postalCode: p.pincode,
    country: 'IN',
    paymentTerm: p.payTerm,
  };
}

function e3(
  vendorCode: string, vendorName: string, city: string, state: string, postalCode: string,
  panNumber: string, gstNumber: string | null, msmeNumber: string | null,
  bankAccount: string, ifscCode: string, bankName: string, withholdTaxGroup: string,
) {
  return {
    vendorCode, vendorName,
    taxOrgType: 'CORPORATION',
    vendorTypeLookupCode: 'CREDITORS FOR PURCHASES',
    status: 'Active',
    msmeNumber, gstNumber, panNumber, withholdTaxGroup,
    paymentMethodCode: 'EFT',
    bankAccount, ifscCode, bankName,
    bankBranchName: ifscCode,
    address: `${city}, ${state}`,
    city, state, postalCode, country: 'IN',
    paymentTerm: 'Net 30',
  };
}
