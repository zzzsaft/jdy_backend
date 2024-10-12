import { BaseEntity, Column, Entity, PrimaryColumn } from "typeorm";

@Entity("xft_city")
export class XftCity extends BaseEntity {
  @PrimaryColumn()
  cityCode: string;

  @Column()
  cityName: string;

  @Column()
  countryNam: string;

  @Column()
  cityNameEn: string;

  @Column()
  countryNamEn: string;

  @Column({ nullable: true })
  cityPath: string;

  @Column({ nullable: true })
  pathName: string;
}
