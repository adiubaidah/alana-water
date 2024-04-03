import { Prisma } from "@prisma/client";
import _ from "lodash";
import { NextRequest, NextResponse } from "next/server";
import { startOfDay, endOfDay } from "date-fns";
import { prismaInstance, prismaPaginate } from "~/lib/prisma";
import { NewTransaksi } from "~/schema";

export async function POST(req: NextRequest) {
  try {
    const payload: NewTransaksi = await req.json();
    const { jenisTransaksiId, kuantitas, namaPembeli, tanggal } = payload;

    if (!jenisTransaksiId || !kuantitas || !namaPembeli || !tanggal) {
      return NextResponse.json(
        { message: "Request tidak valid" },
        { status: 400 }
      );
    }
    const sisaGalon = await prismaInstance.galonTersisa.findUnique({
      where: {
        id: 1,
      },
    });

    if (!sisaGalon) {
      throw Error("Kesalahan database galon");
    }

    const findJenisTransaksi = await prismaInstance.jenisTranksasi.findUnique({
      where: {
        id: jenisTransaksiId,
      },
    });

    if (!findJenisTransaksi) {
      return NextResponse.json(
        {},
        { status: 400, statusText: "Jenis transaksi tidak ditemukan" }
      );
    }

    if (sisaGalon.jumlah > 0) {
      if (jenisTransaksiId !== 1) {
        await prismaInstance.galonTersisa.update({
          where: {
            id: 1,
          },
          data: {
            jumlah: {
              decrement: kuantitas,
            },
          },
        });
      }
    } else {
      return NextResponse.json({}, { status: 400, statusText: "Galon habis" });
    }

    const result = await prismaInstance.transaksi.create({
      data: {
        kuantitas,
        namaPembeli,
        tanggal,
        jenisTransaksiId,
        harga: findJenisTransaksi.harga,
      },
    });

    if (jenisTransaksiId === 3) {
      await prismaInstance.pengembalianGalon.create({
        data: {
          kembali: 0,
          pinjam: result.kuantitas,
          kodeTransaksi: result.kode,
        },
      });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.log("[POST_TRANSAKSI]" + err);
    return NextResponse.json(
      {},
      { status: 500, statusText: "Terjadi kesalahan" }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const page = parseInt(params.get("page") as string);
    const kodeOrPembeli = params.get("q");
    const tanggal = params.get("tanggal");
    const jenis = params.getAll("jenis");
    const jenisNumber = _.map(jenis, Number);

    const whereQuery: Prisma.TransaksiWhereInput = {
      ...(jenisNumber.length > 0 && {
        jenisTransaksiId: {
          in: jenisNumber,
        },
      }),
      ...(tanggal && {
        tanggal: {
          gte: startOfDay(new Date(tanggal)),
          lt: endOfDay(new Date(tanggal)),
        },
      }),
    };
    // Hanya tambahkan kondisi OR jika kodeOrPembeli ada
    if (kodeOrPembeli) {
      whereQuery.OR = [
        {
          namaPembeli: {
            contains: kodeOrPembeli,
            mode: "insensitive",
          },
        },
        {
          kode: {
            equals: kodeOrPembeli,
          },
        },
      ];
    }

    const [result, meta] = await prismaPaginate.transaksi
      .paginate({
        where: whereQuery,
        include: {
          jenisTransaksi: true,
        },
        orderBy: {
          tanggal: "desc",
        },
      })
      .withPages({
        limit: 6,
        page: !!page ? page : 1,
        includePageCount: true,
      });
    const payload = result.map((trans) => {
      const total = trans.harga * trans.kuantitas;
      return { ...trans, total };
    });

    return NextResponse.json({ payload, meta: { ...meta } });
  } catch (err) {
    console.log("[GET_TRANSAKSII] " + err);
    return NextResponse.json(
      {},
      { status: 500, statusText: "Terjadi kesalahan" }
    );
  }
}
